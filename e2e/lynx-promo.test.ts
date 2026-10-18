import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import postcss from 'postcss'
import { beforeAll, describe, expect, it } from 'vitest'
import { createPnpmCommand } from '../scripts/pnpm-command.mjs'

const repoRoot = fileURLToPath(new URL('../', import.meta.url))
const exampleDir = path.join(repoRoot, 'examples', 'react-lynx-promo')
const intermediateDir = path.join(exampleDir, 'dist', '.lynx', 'main')
const artifactsDir = path.join(repoRoot, 'e2e', '.artifacts', 'lynx-promo-static')
let encoderCss = ''
let decodedCss = ''
let bundle: Uint8Array

async function runPnpm(args: string[], logName: string, debug = '') {
  const command = createPnpmCommand(args)
  try {
    const result = await promisify(execFile)(command.command, command.args, {
      cwd: repoRoot,
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
    encoderCss = await fs.readFile(path.join(intermediateDir, 'main.css'), 'utf8')
    bundle = new Uint8Array(await fs.readFile(path.join(exampleDir, 'dist', 'main.lynx.bundle')))
    const require = createRequire(path.join(repoRoot, 'e2e', 'package.json'))
    const decoder = require('@lynx-js/tasm') as {
      supportNapi: () => boolean
      decode_napi: (source: Uint8Array) => unknown
      decode_wasm: (source: Uint8Array) => Promise<unknown>
    }
    const decoded = (decoder.supportNapi() ? decoder.decode_napi(bundle) : await decoder.decode_wasm(bundle)) as { css: { text: string } }
    decodedCss = decoded.css.text.replace(/\{\{(--[a-z0-9-]+)\}\}/gi, 'var($1)')
    await fs.writeFile(path.join(artifactsDir, 'main.css'), encoderCss)
  }, 420_000)

  it('重新生成 Tailwind CSS 并匹配完整样式基线', () => {
    expect(bundle.byteLength).toBeGreaterThan(1024)
    expect(encoderCss).toContain('tailwindcss v4.3.3')
    expect(encoderCss).not.toContain('@source')
    expect(encoderCss.replace(/\r\n/g, '\n')).toMatchSnapshot()
  })

  it('任意值颜色、圆角、间距与滚动说明卡进入真实原生 bundle', () => {
    expect(declarations(encoderCss, '.bg-\\[\\#10241b\\]')).toMatchObject({ 'background-color': '#10241b' })
    // decoder 的诊断选择器不保留 CSS 转义，shorthand 已按原生属性展开。
    expect(declarations(decodedCss, '.bg-[#10241b]')).toMatchObject({ 'background-color': '#10241b' })
    expect(declarations(decodedCss, '.rounded-[18px]')).toEqual({
      'border-bottom-left-radius': '18px',
      'border-bottom-right-radius': '18px',
      'border-top-left-radius': '18px',
      'border-top-right-radius': '18px',
    })
    expect(declarations(decodedCss, '.p-4')).toEqual({
      'padding-bottom': '1rem',
      'padding-left': '1rem',
      'padding-right': '1rem',
      'padding-top': '1rem',
    })
    expect(declarations(decodedCss, '.min-h-[260px]')).toEqual({ 'min-height': '260px' })
    expect(declarations(decodedCss, '.h-screen')).toEqual({ height: '100vh' })
  })

  it('示例仍为可滚动的真实组件，状态卡有唯一的录制编辑入口', async () => {
    const [app, card, tasm] = await Promise.all([
      fs.readFile(path.join(exampleDir, 'src', 'App.tsx'), 'utf8'),
      fs.readFile(path.join(exampleDir, 'src', 'components', 'BuildStatus.tsx'), 'utf8'),
      fs.readFile(path.join(intermediateDir, 'tasm.json'), 'utf8'),
    ])
    expect(app).toContain('<scroll-view scroll-y')
    expect(app).toContain('<BuildStatus />')
    expect(app).not.toContain('setInterval')
    expect(card).toContain('rounded-[18px] p-4 bg-[#10241b]')
    expect(JSON.parse(tasm).sourceContent.config.enableCSSInlineVariables).toBe(true)
  })
})
