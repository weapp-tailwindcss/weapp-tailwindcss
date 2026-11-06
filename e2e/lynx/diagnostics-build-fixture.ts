import type { LynxCssVariablesPlugin, LynxTemplatePluginApi } from '../../packages/lynx/src/css-variables'
import type { LynxDiagnosticsReport } from '../../packages/lynx/src/diagnostics'
import type { CssMapInput } from '../../packages/lynx/src/diagnostics/input'
import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const example = path.resolve(import.meta.dirname, '../../examples/react-lynx')
const exampleRequire = createRequire(path.join(example, 'package.json'))
function packageEntry(name: string, subpath = '.') {
  const file = exampleRequire.resolve(`${name}/package.json`)
  const exports = JSON.parse(readFileSync(file, 'utf8')).exports[subpath]
  const entry = exports.import ?? exports.default
  return pathToFileURL(path.resolve(path.dirname(file), typeof entry === 'string' ? entry : entry.default)).href
}

export async function buildDiagnosticsFixture(directory: string, strict: boolean, mode: 'development' | 'production' = 'development') {
  const [adapter, decoder] = await Promise.all([
    import(packageEntry('@weapp-tailwindcss/lynx')) as Promise<typeof import('../../packages/lynx/src/index')>,
    import(packageEntry('@weapp-tailwindcss/lynx', './decoder')) as Promise<typeof import('../../packages/lynx/src/decoder')>,
  ])
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
    const bundle = new Uint8Array(await fs.readFile(path.join(directory, 'dist', 'main.lynx.bundle')).catch((error) => {
      // 严格诊断可以使构建失败，但缺少真实 bundle 时必须保留首个构建错误。
      throw new Error('Lynx 诊断构建没有生成 main.lynx.bundle', { cause: failure ?? error })
    }))
    const decoded = await decoder.decodeLynxBundle(bundle)
    const artifacts = path.join(import.meta.dirname, '../.artifacts', 'lynx-diagnostics', mode, strict ? 'strict' : 'default')
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
    return { reports, failure: failure instanceof Error ? failure.stack : failure, bundle, decoded, outputs, inputs }
  }
  finally {
    await build?.close()
  }
}
