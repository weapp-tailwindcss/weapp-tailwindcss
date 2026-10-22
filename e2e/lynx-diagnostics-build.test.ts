import type { LynxCssVariablesPlugin, LynxTemplatePluginApi } from '../packages/lynx/src/css-variables'
import type { LynxDiagnosticsReport } from '../packages/lynx/src/diagnostics'
import type { CssMapInput } from '../packages/lynx/src/diagnostics/input'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { execa } from 'execa'
import { beforeAll, describe, expect, it } from 'vitest'

const example = path.resolve(import.meta.dirname, '../examples/react-lynx')
const exampleRequire = createRequire(path.join(example, 'package.json'))

function packageEntry(name: string, subpath = '.') {
  const file = exampleRequire.resolve(`${name}/package.json`)
  const exports = JSON.parse(readFileSync(file, 'utf8')).exports[subpath]
  return pathToFileURL(path.resolve(path.dirname(file), exports.import ?? exports.default)).href
}

let adapter: typeof import('../packages/lynx/src/index')
let decoder: typeof import('../packages/lynx/src/decoder')

beforeAll(async () => {
  await execa('pnpm', ['--filter', '@weapp-tailwindcss/lynx...', 'build'], { cwd: path.resolve(example, '../..'), env: { CI: '1' } })
  adapter = await import(packageEntry('@weapp-tailwindcss/lynx'))
  decoder = await import(packageEntry('@weapp-tailwindcss/lynx', './decoder'))
}, 300_000)

async function buildFixture(strict: boolean, mode: 'development' | 'production' = 'development') {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx-diagnostics-'))
  const reports: LynxDiagnosticsReport[] = []
  const inputs = new Map<string, CssMapInput>()
  let build: { close: () => Promise<void> } | undefined
  try {
    await fs.symlink(path.join(example, 'node_modules'), path.join(directory, 'node_modules'), 'junction')
    await fs.writeFile(path.join(directory, 'index.tsx'), `import {root} from '@lynx-js/react'; import './style.css'; root.render(<view className="px-[7.5px] [mask-type:luminance] pl-[7.5px] pr-[7.5px] group theme-probe app-probe"><view className="group-hover:bg-red-500" /></view>);`)
    await fs.writeFile(path.join(directory, 'style.css'), `@import 'tailwindcss' source(none);
@source inline('px-[7.5px] [mask-type:luminance] pl-[7.5px] pr-[7.5px] group-hover:bg-red-500 p-[13px] gap-[7px]');
:root { --color-brand: #f00; --brand-color: oklch(63% .2 40); }
.theme-dark { --color-brand: #00f; --brand-color: #00f; }
.theme-probe { background-color: var(--color-brand); }
.app-probe { color: var(--brand-color); }
.mixed { --tw-business: 1; mask-type: luminance; width: 10px; }
.multi, .other { mask-type: luminance; }
`)
    if (mode === 'production') {
      await fs.writeFile(path.join(directory, 'secondary.tsx'), `import {root} from '@lynx-js/react'; import './secondary.css'; root.render(<view className="secondary-control secondary-rejected" />);`)
      await fs.writeFile(path.join(directory, 'secondary.css'), '.secondary-control { height: 31px; } .secondary-rejected { mask-type: luminance; }')
    }
    const [{ createRspeedy }, { pluginReactLynx }, { pluginLynxConfig }] = await Promise.all([
      import(packageEntry('@lynx-js/rspeedy')),
      import(packageEntry('@lynx-js/react-rsbuild-plugin')),
      import(packageEntry('@lynx-js/config-rsbuild-plugin')),
    ])
    const inputObserver: ReturnType<typeof adapter.pluginLynxTailwindcss> = {
      name: 'fixture:independent-encoder-input',
      setup(api) {
        api.modifyBundlerChain((chain) => {
          const exposed = api.useExposed(Symbol.for('LynxTemplatePlugin')) as { LynxTemplatePlugin: LynxTemplatePluginApi }
          class RecordInput {
            apply(compiler: Parameters<LynxCssVariablesPlugin['apply']>[0]) {
              compiler.hooks.thisCompilation.tap('fixture:encoder-input', (compilation) => {
                const hooks = exposed.LynxTemplatePlugin.getLynxTemplatePluginHooks(compilation)
                hooks.beforeEmit!.tapPromise('fixture:encoder-input', async (args) => {
                  const css = args.finalEncodeOptions.css as CssMapInput
                  inputs.set(args.outputName, structuredClone({ cssMap: css.cssMap, cssSource: css.cssSource }))
                  return args
                })
              })
            }
          }
          chain.plugin('fixture:encoder-input').use(RecordInput, [])
        })
      },
    }
    const rspeedy = await createRspeedy({
      cwd: directory,
      loadEnv: false,
      rspeedyConfig: {
        mode,
        source: { entry: { main: path.join(directory, 'index.tsx'), ...mode === 'production' ? { secondary: path.join(directory, 'secondary.tsx') } : {} } },
        output: { distPath: { root: path.join(directory, 'dist') }, sourceMap: { css: true } },
        plugins: [
          pluginReactLynx({ engineVersion: '3.9' }),
          pluginLynxConfig({ enableCSSRule: true }),
          adapter.pluginLynxTailwindcss({ diagnostics: { strict, onReport: report => reports.push(report) } }),
          inputObserver,
        ],
      },
    })
    let failure: unknown
    try {
      build = await rspeedy.build()
    }
    catch (error) {
      failure = error
    }
    const bundle = new Uint8Array(await fs.readFile(path.join(directory, 'dist', 'main.lynx.bundle')))
    const decoded = await decoder.decodeLynxBundle(bundle)
    const artifacts = path.join(import.meta.dirname, '.artifacts', 'lynx-diagnostics', mode, strict ? 'strict' : 'default')
    await fs.mkdir(artifacts, { recursive: true })
    await fs.writeFile(path.join(artifacts, 'main.lynx.bundle'), bundle)
    await fs.writeFile(path.join(artifacts, 'report.json'), JSON.stringify(reports, null, 2))
    await fs.writeFile(path.join(artifacts, 'decoded.css'), decoded.css.text)
    await fs.writeFile(path.join(artifacts, 'encoder-inputs.json'), JSON.stringify(Object.fromEntries(inputs), null, 2))
    // 生产构建不输出 .lynx 调试文件；实际输入由独立模板 hook 归档。
    if (mode === 'development') {
      await fs.copyFile(path.join(directory, 'dist', '.lynx', 'main', 'tasm.json'), path.join(artifacts, 'tasm.json'))
      await fs.copyFile(path.join(directory, 'dist', '.lynx', 'main', 'main.css'), path.join(artifacts, 'input.css'))
    }
    const outputs = [{ name: 'main.lynx.bundle', bundle, decoded }]
    if (mode === 'production') {
      const secondary = new Uint8Array(await fs.readFile(path.join(directory, 'dist', 'secondary.lynx.bundle')))
      const secondaryDecoded = await decoder.decodeLynxBundle(secondary)
      await fs.writeFile(path.join(artifacts, 'secondary.lynx.bundle'), secondary)
      await fs.writeFile(path.join(artifacts, 'secondary-decoded.css'), secondaryDecoded.css.text)
      outputs.push({ name: 'secondary.lynx.bundle', bundle: secondary, decoded: secondaryDecoded })
    }
    return { reports, failure, bundle, decoded, outputs, inputs }
  }
  finally {
    try {
      await build?.close()
    }
    finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  }
}

describe('正式 Rspeedy hook 的业务诊断', () => {
  it('生产双入口分别绑定本轮 encoder 输入、实际资产与来源，不交叉归因', async () => {
    const { reports, failure, outputs, inputs } = await buildFixture(false, 'production')
    expect(failure).toBeUndefined()
    expect(reports.map(report => report.evidence?.outputName).sort()).toEqual(['main.lynx.bundle', 'secondary.lynx.bundle'])
    expect(new Set(outputs.map(output => createHash('sha256').update(output.bundle).digest('hex'))).size).toBe(2)
    for (const output of outputs) {
      const report = reports.find(item => item.evidence?.outputName === output.name)!
      const input = inputs.get(output.name)!
      expect(Object.keys(input.cssMap ?? {})).not.toHaveLength(0)
      expect(report.evidence).toMatchObject({
        bundleSha256: createHash('sha256').update(output.bundle).digest('hex'),
        decodedCssSha256: createHash('sha256').update(output.decoded.css.text).digest('hex'),
        decoderIdentity: decoder.lynxDecoderIdentity(),
        inputCssSha256: createHash('sha256').update(JSON.stringify([input.cssMap, input.cssSource])).digest('hex'),
      })
      const secondary = output.name === 'secondary.lynx.bundle'
      const utility = secondary ? 'secondary-rejected' : '[mask-type:luminance]'
      const otherUtility = secondary ? '[mask-type:luminance]' : 'secondary-rejected'
      const source = secondary ? 'secondary.css' : 'style.css'
      expect(report.diagnostics.some(item => item.utility === utility && item.property === 'mask-type' && item.status === 'encoder-rejected' && item.source?.file?.endsWith(source))).toBe(true)
      expect(report.diagnostics.some(item => item.utility === otherUtility)).toBe(false)
      expect(output.decoded.css.text.includes('.secondary-control')).toBe(secondary)
      expect(output.decoded.css.text.includes('.theme-probe')).toBe(!secondary)
    }
  }, 120_000)

  it.each([false, true])('strict=%s：实际发出的 bundle、输入来源和拒绝分别验证', async (strict) => {
    const { reports, failure, bundle, decoded } = await buildFixture(strict)
    expect(Boolean(failure)).toBe(strict)
    const report = reports.find(item => item.evidence?.outputName === 'main.lynx.bundle')!
    expect(report).toBeTruthy()
    const builderRequire = createRequire(exampleRequire.resolve('@lynx-js/react-rsbuild-plugin/package.json'))
    const templateRequire = createRequire(builderRequire.resolve('@lynx-js/template-webpack-plugin/package.json'))
    const encoder = JSON.parse(readFileSync(templateRequire.resolve('@lynx-js/tasm/package.json'), 'utf8'))
    expect(report.versions).toMatchObject({ encoder: encoder.version, engine: 'unknown', targetSdk: '3.9' })
    expect(report.versionEvidence.encoder).toContain('@lynx-js/tasm')
    expect(report.versionEvidence.engine).toContain('宿主')
    expect(report.evidence).toMatchObject({
      bundleSha256: createHash('sha256').update(bundle).digest('hex'),
      decoderIdentity: decoder.lynxDecoderIdentity(),
      decodedCssSha256: createHash('sha256').update(decoded.css.text).digest('hex'),
    })
    for (const property of ['padding-inline', 'mask-type']) {
      expect(report.diagnostics.some(item => item.property === property && item.status === 'encoder-rejected' && item.category === 'business')).toBe(true)
    }
    expect(report.diagnostics.some(item => item.selector?.includes('group-hover') && item.status === 'encoder-rejected')).toBe(true)
    expect(decoded.css.text).toContain('background-color: {{--color-brand}}')
    expect(decoded.css.text).toContain('color: {{--brand-color}}')
    expect(decoded.css.text).toMatch(/padding-left:\s*7\.5px/)
    expect(decoded.css.text).toMatch(/padding-right:\s*7\.5px/)
    expect(report.diagnostics.some(item => item.source?.file?.endsWith('style.css'))).toBe(true)
    expect(report.diagnostics.every(item => item.origin === 'bundle-comparison' || item.raw !== undefined)).toBe(true)
    expect(report.diagnostics.filter(item => item.property === 'mask-type').every(item => item.origin === 'bundle-comparison')).toBe(true)
    expect(report.diagnostics.filter(item => item.status === 'encoder-rejected').every(item => item.reason?.includes('实际 bundle') && item.suggestion)).toBe(true)
    expect(report.diagnostics.find(item => item.property === 'padding-inline')?.suggestion).toContain('RTL')
    expect(decoded.css.text).toMatch(/padding-top:\s*13px/)
    expect(decoded.css.text).toMatch(/padding-right:\s*13px/)
    expect(decoded.css.text).toMatch(/padding-bottom:\s*13px/)
    expect(decoded.css.text).toMatch(/padding-left:\s*13px/)
    expect(decoded.css.text).toMatch(/row-gap:\s*7px/)
    expect(decoded.css.text).toMatch(/column-gap:\s*7px/)
    const cjs = exampleRequire('@weapp-tailwindcss/lynx/decoder')
    expect((await cjs.decodeLynxBundle(bundle)).css.text).toBe(decoded.css.text)
    expect(cjs.lynxDecoderIdentity()).toBe(decoder.lynxDecoderIdentity())
    expect(report.diagnostics.some(item => /^(?:padding|gap)$/.test(item.property ?? '') && item.status === 'encoder-rejected')).toBe(false)
    expect({
      css: decoded.css.text,
      business: report.diagnostics.filter(item => item.category === 'business').map(({ selector, property, status, origin }) => ({ selector, property, status, origin })),
    }).toMatchSnapshot()
  }, 120_000)
})
