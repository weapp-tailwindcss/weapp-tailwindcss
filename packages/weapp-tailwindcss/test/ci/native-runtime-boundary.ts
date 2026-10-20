import type { BuildResult } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { build } from 'esbuild'

const valueRuntimeFiles = [
  'native-runtime.ts',
  path.join('compat', 'native', 'context.ts'),
  path.join('compat', 'native', 'length.ts'),
  path.join('compat', 'native', 'shadow.ts'),
  path.join('compat', 'native', 'transform.ts'),
  path.join('compat', 'native', 'values.ts'),
  path.join('compat', 'native', 'variables.ts'),
  path.join('compat', 'color-mix', 'constants.ts'),
  path.join('compat', 'color-mix', 'parse.ts'),
]

// 仅允许原生值解释器的纯 JS 闭包；PostCSS root/插件和生成器不在此边界内。
const valueRuntimePackages = new Set([
  'postcss-value-parser',
  '@csstools/css-tokenizer',
  '@csstools/css-parser-algorithms',
  '@csstools/css-color-parser',
  '@csstools/color-helpers',
  '@csstools/css-calc',
])

export function insideRuntimeDirectory(directory: string, file: string, api = path) {
  const relative = api.relative(directory, file)
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${api.sep}`) && !api.isAbsolute(relative)
}

function packageName(file: string) {
  let directory = path.dirname(file)
  while (true) {
    const manifest = path.join(directory, 'package.json')
    if (fs.existsSync(manifest)) {
      return (JSON.parse(fs.readFileSync(manifest, 'utf8')) as { name?: string }).name
    }
    const parent = path.dirname(directory)
    if (parent === directory) {
      return undefined
    }
    directory = parent
  }
}

function assertClosedBrowserBundle(result: BuildResult<{ write: false, metafile: true }>) {
  const imports = Object.values(result.metafile.outputs).flatMap(output => output.imports)
  if (imports.length) {
    throw new Error(`原生运行时存在外部依赖：${JSON.stringify(imports)}`)
  }
  const bytes = result.outputFiles.reduce((sum, file) => sum + file.contents.byteLength, 0)
  // 当前压缩产物约 129 KiB；增长须审查，不能靠扩大模块白名单静默加载编译器。
  if (bytes > 160 * 1024) {
    throw new Error(`原生运行时 bundle 超过 160 KiB：${bytes}`)
  }
  return bytes
}

/** 同时构建源码闭包及公开子路径，避免共享构建 chunk 隐藏编译模块。 */
export async function inspectNativeRuntime(root: string, injectedImport?: string) {
  const entry = path.join(root, 'packages', 'react-native', 'src', 'runtime.ts')
  const source = await build({
    absWorkingDir: root,
    entryPoints: [entry],
    bundle: true,
    platform: 'browser',
    format: 'esm',
    minify: true,
    write: false,
    metafile: true,
    logLevel: 'silent',
    plugins: [{
      name: 'native-runtime-source-boundary',
      setup(api) {
        api.onResolve({ filter: /^@weapp-tailwindcss\/postcss\/(?:native-runtime|native)$/ }, ({ path: specifier }) => ({
          path: path.join(root, 'packages', 'postcss', 'src', specifier.endsWith('/native-runtime') ? 'native-runtime.ts' : 'native.ts'),
        }))
        if (injectedImport) {
          api.onLoad({ filter: /runtime\.ts$/ }, ({ path: file }) => {
            if (file !== entry) {
              return undefined
            }
            return { contents: `${fs.readFileSync(entry, 'utf8')}\nexport * from ${JSON.stringify(injectedImport)}\n`, loader: 'ts' }
          })
        }
      },
    }],
  })
  const inputs = Object.keys(source.metafile.inputs).map(file => path.resolve(root, file))
  const runtimeDirectory = path.join(root, 'packages', 'react-native', 'src', 'runtime')
  const valueFiles = new Set(valueRuntimeFiles.map(file => path.join(root, 'packages', 'postcss', 'src', file)))
  const forbidden = inputs.filter(file => file !== entry && !insideRuntimeDirectory(runtimeDirectory, file) && !valueFiles.has(file) && !valueRuntimePackages.has(packageName(file) ?? ''))
  if (forbidden.length) {
    throw new Error(`原生运行时加载了编译依赖：${forbidden.map(file => path.relative(root, file)).join(', ')}`)
  }
  const sourceBytes = assertClosedBrowserBundle(source)
  const published = await build({
    absWorkingDir: root,
    entryPoints: [entry],
    bundle: true,
    platform: 'browser',
    format: 'esm',
    minify: true,
    write: false,
    metafile: true,
    logLevel: 'silent',
  })
  return { sourceBytes, publishedBytes: assertClosedBrowserBundle(published), inputs }
}
