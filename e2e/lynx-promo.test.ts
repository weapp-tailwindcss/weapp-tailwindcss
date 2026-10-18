import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import postcss from 'postcss'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPnpmCommand } from '../scripts/pnpm-command.mjs'

const repoRoot = fileURLToPath(new URL('../', import.meta.url))
const exampleDir = path.join(repoRoot, 'examples', 'react-lynx-promo')
const artifactsDir = path.join(repoRoot, 'e2e', '.artifacts', 'lynx-promo-static')
const cardPath = path.join('src', 'components', 'BuildStatus.tsx')
const stages = [
  { id: 'initial', padding: '8px', radius: '4px', color: '#1e40af' },
  { id: 'spacing', padding: '24px', radius: '28px', color: '#1e40af' },
  { id: 'color', padding: '24px', radius: '28px', color: '#047857' },
] as const
type StageId = typeof stages[number]['id']
interface BuildOutput {
  encoderCss: string
  decodedCss: string
  decodedText: string
  bundle: Uint8Array
  tasm: string
}
const outputs = new Map<StageId, BuildOutput>()
let temporaryRoot: string | undefined

async function runPnpm(args: string[], logName: string, debug = '', cwd = repoRoot) {
  const command = createPnpmCommand(args)
  try {
    const result = await promisify(execFile)(command.command, command.args, {
      cwd,
      shell: command.shell,
      env: { ...process.env, CI: '1', DEBUG: debug },
      timeout: 300_000,
      maxBuffer: 20 * 1024 * 1024,
    })
    await fs.writeFile(path.join(artifactsDir, logName), `${result.stdout}\n${result.stderr}`)
  }
  catch (error) {
    const failure = error as Error & { stdout?: string, stderr?: string }
    await fs.writeFile(path.join(artifactsDir, logName), `${failure.stdout ?? ''}\n${failure.stderr ?? ''}\n${failure.message}`)
    throw error
  }
}

async function readBuildOutput(directory: string, stage: StageId): Promise<BuildOutput> {
  const intermediate = path.join(directory, 'dist', '.lynx', 'main')
  const [encoderCss, bundleBytes, tasm, source] = await Promise.all([
    fs.readFile(path.join(intermediate, 'main.css'), 'utf8'),
    fs.readFile(path.join(directory, 'dist', 'main.lynx.bundle')),
    fs.readFile(path.join(intermediate, 'tasm.json'), 'utf8'),
    fs.readFile(path.join(directory, cardPath), 'utf8'),
  ])
  const bundle = new Uint8Array(bundleBytes)
  const require = createRequire(path.join(repoRoot, 'e2e', 'package.json'))
  const decoder = require('@lynx-js/tasm') as {
    supportNapi: () => boolean
    decode_napi: (source: Uint8Array) => unknown
    decode_wasm: (source: Uint8Array) => Promise<unknown>
  }
  const decoded = (decoder.supportNapi() ? decoder.decode_napi(bundle) : await decoder.decode_wasm(bundle)) as { css: { text: string } }
  const stageArtifacts = path.join(artifactsDir, stage)
  await fs.mkdir(stageArtifacts, { recursive: true })
  await Promise.all([
    fs.writeFile(path.join(stageArtifacts, 'main.css'), encoderCss),
    fs.writeFile(path.join(stageArtifacts, 'main.lynx.bundle'), bundle),
    fs.writeFile(path.join(stageArtifacts, 'BuildStatus.tsx'), source),
  ])
  return { encoderCss, decodedCss: decoded.css.text.replace(/\{\{(--[a-z0-9-]+)\}\}/gi, 'var($1)'), decodedText: JSON.stringify(decoded), bundle, tasm }
}

async function buildStageFixture(stage: typeof stages[number]) {
  const directory = path.join(temporaryRoot!, stage.id)
  await fs.mkdir(directory)
  await fs.cp(path.join(exampleDir, 'src'), path.join(directory, 'src'), { recursive: true })
  await Promise.all(['package.json', 'lynx.config.ts', 'tsconfig.json'].map(file => fs.copyFile(path.join(exampleDir, file), path.join(directory, file))))
  // 仅复制到本轮临时目录，不改写最终态源码，也不依赖固定平台的临时路径。
  await fs.symlink(path.join(exampleDir, 'node_modules'), path.join(directory, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
  const source = await fs.readFile(path.join(directory, cardPath), 'utf8')
  const next = source
    .replace('p-[24px]', `p-[${stage.padding}]`)
    .replaceAll('rounded-[28px]', `rounded-[${stage.radius}]`)
    .replace('bg-[#047857]', `bg-[${stage.color}]`)
  await fs.writeFile(path.join(directory, cardPath), next)
  await runPnpm(['exec', 'rspeedy', 'build', '--mode', 'development'], `${stage.id}.log`, 'lynx', directory)
  outputs.set(stage.id, await readBuildOutput(directory, stage.id))
}

function declarations(css: string, selector: string) {
  const result: Record<string, string> = {}
  postcss.parse(css).walkRules((rule) => {
    if (rule.selectors.includes(selector)) {
      rule.walkDecls((declaration) => {
        result[declaration.prop] = declaration.value
      })
    }
  })
  return result
}

describe('ReactLynx 宣传示例真实 static 产物', () => {
  beforeAll(async () => {
    await fs.mkdir(artifactsDir, { recursive: true })
    // 串行构建当前工作树的依赖和公开插件，不能读取旧 bundle 代替本轮源码。
    await runPnpm([
      '--workspace-concurrency=1',
      '--filter',
      'weapp-tailwindcss...',
      '--filter',
      '@weapp-tailwindcss/lynx',
      'build',
    ], 'packages.log')
    await runPnpm([
      '--filter',
      '@weapp-tailwindcss/example-react-lynx-promo',
      'exec',
      'rspeedy',
      'build',
      '--mode',
      'development',
    ], 'encoder.log', 'lynx')
    outputs.set('color', await readBuildOutput(exampleDir, 'color'))
    temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx-promo-static-'))
    for (const stage of stages.slice(0, 2)) {
      await buildStageFixture(stage)
    }
  }, 420_000)

  afterAll(async () => {
    if (temporaryRoot) {
      await fs.rm(temporaryRoot, { recursive: true, force: true })
    }
  })

  it('重新生成 Tailwind CSS 并匹配完整样式基线', () => {
    const { bundle, encoderCss } = outputs.get('color')!
    expect(bundle.byteLength).toBeGreaterThan(1024)
    expect(encoderCss).toContain('tailwindcss v4.3.3')
    expect(encoderCss).not.toContain('@source')
    // 开发服务器地址会随机器和网络变化，不属于生成样式的基线语义。
    const stableCss = encoderCss.replace(/\r\n/g, '\n').replace(/(sourceMappingURL=)https?:\/\/[^/]+/g, '$1<dev-server>')
    expect(stableCss).toMatchSnapshot()
  })

  it.each(stages)('$id 阶段的颜色、px 间距、任意值圆角和真实头像进入原生 bundle', async (stage) => {
    const { bundle, decodedCss, decodedText, encoderCss } = outputs.get(stage.id)!
    expect(bundle.byteLength).toBeGreaterThan(1024)
    expect(declarations(encoderCss, `.bg-\\[\\${stage.color}\\]`)).toMatchObject({ 'background-color': stage.color })
    // decoder 的诊断选择器不保留 CSS 转义，shorthand 已按原生属性展开。
    expect(declarations(decodedCss, `.bg-[${stage.color}]`)).toMatchObject({ 'background-color': stage.color })
    expect(declarations(decodedCss, `.rounded-[${stage.radius}]`)).toEqual({
      'border-bottom-left-radius': stage.radius,
      'border-bottom-right-radius': stage.radius,
      'border-top-left-radius': stage.radius,
      'border-top-right-radius': stage.radius,
    })
    expect(declarations(decodedCss, `.p-[${stage.padding}]`)).toEqual({
      'padding-bottom': stage.padding,
      'padding-left': stage.padding,
      'padding-right': stage.padding,
      'padding-top': stage.padding,
    })
    expect(declarations(decodedCss, '.text-white')).toEqual({ color: '#ffffff' })
    expect(declarations(decodedCss, '.text-[20px]')).toEqual({ 'font-size': '20px' })
    expect(declarations(decodedCss, '.text-[16px]')).toEqual({ 'font-size': '16px' })
    expect(declarations(decodedCss, '.h-[96px]')).toEqual({ height: '96px' })
    expect(declarations(decodedCss, '.w-[96px]')).toEqual({ width: '96px' })
    expect(declarations(decodedCss, '.mr-[16px]')).toEqual({ 'margin-right': '16px' })
    const avatar = await fs.readFile(path.join(exampleDir, 'src', 'assets', 'github-avatar.jpg'))
    expect(decodedText).toContain(`data:image/jpeg;base64,${avatar.toString('base64')}`)
    expect(declarations(decodedCss, '.min-h-[260px]')).toEqual({ 'min-height': '260px' })
    expect(declarations(decodedCss, '.h-screen')).toEqual({ height: '100vh' })
  })

  it('示例仍为可滚动的真实组件，状态卡有唯一的录制编辑入口', async () => {
    const [app, card] = await Promise.all([
      fs.readFile(path.join(exampleDir, 'src', 'App.tsx'), 'utf8'),
      fs.readFile(path.join(exampleDir, 'src', 'components', 'BuildStatus.tsx'), 'utf8'),
    ])
    expect(app).toContain('<scroll-view scroll-y')
    expect(app).toContain('<BuildStatus />')
    expect(app).not.toContain('setInterval')
    expect(card).toContain('p-[24px] rounded-[28px]')
    expect(card).toContain('bg-[#047857]')
    expect(card).toContain('text-[20px] font-bold text-white')
    expect(card).toContain('<image')
    expect(card).toContain('src={githubAvatar}')
    expect(card).toContain('h-[96px] w-[96px] rounded-[28px]')
    expect(card).not.toContain('setInterval')
    expect(JSON.parse(outputs.get('color')!.tasm).sourceContent.config.enableCSSInlineVariables).toBe(true)
  })
})
