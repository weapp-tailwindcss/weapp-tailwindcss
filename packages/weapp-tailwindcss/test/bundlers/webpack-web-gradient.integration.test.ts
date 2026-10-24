import type { SourceBuildReceipt } from './webpack/source-build-receipt'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import webpack from 'webpack'
import { createSourceBuildReceipt } from './webpack/source-build-receipt'

const require = createRequire(import.meta.url)
const websiteRequire = createRequire(fileURLToPath(new URL('../../../../website/package.json', import.meta.url)))
const coreRequire = createRequire(websiteRequire.resolve('@docusaurus/core/package.json'))
const bundlerRequire = createRequire(coreRequire.resolve('@docusaurus/bundler/package.json'))
const { createStyleLoadersFactory } = bundlerRequire('./lib/loaders/styleLoader.js')
const { getCSSExtractPlugin } = bundlerRequire('./lib/currentBundler.js')
const { WeappTailwindcss } = require('weapp-tailwindcss/webpack')

it('真实导入与 watch 在编码前按本轮完整消费图降级，并保留新增的未知消费', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'weapp-tw-webpack-gradient-')))
  await mkdir(path.join(root, 'node_modules'))
  await symlink(path.dirname(require.resolve('tailwindcss/package.json')), path.join(root, 'node_modules', 'tailwindcss'), process.platform === 'win32' ? 'junction' : 'dir')
  const cssEntry = path.join(root, 'theme.css')
  const palette = path.join(root, 'palette.css')
  const original = '.author-reset { --tw-gradient-position: initial; }'
  const sourceMarker = (revision: number) => `.fixture-source-${revision} {`
  const paletteSource = (revision: number, extra = '') => `${original}\n${sourceMarker(revision)} --fixture-revision: ${revision}; }\n${extra}`
  await writeFile(palette, paletteSource(0))
  await writeFile(path.join(root, 'entry.js'), 'import "./theme.css"')
  await writeFile(cssEntry, [
    '@import "tailwindcss" source(none);',
    '@import "./palette.css";',
    '@source inline("bg-linear-to-r from-red-500 to-blue-500");',
  ].join('\n'))
  const getStyleLoaders = await createStyleLoadersFactory({ currentBundler: { name: 'webpack' } })
  const MiniCssExtractPlugin = await getCSSExtractPlugin({ currentBundler: { name: 'webpack' } })
  const compilationReceipts = new WeakMap<webpack.Compilation, SourceBuildReceipt>()
  const compiler = webpack({
    mode: 'development',
    context: root,
    entry: './entry.js',
    output: { path: path.join(root, 'dist'), filename: 'entry.js' },
    module: { rules: [{ test: /\.css$/, use: getStyleLoaders(false) }] },
    plugins: [
      new MiniCssExtractPlugin({ filename: 'theme.css' }),
      new WeappTailwindcss({
        generator: { target: 'web', webCompat: true },
        tailwindcssBasedir: root,
        tailwindcss: { v4: { base: root, cssEntries: [cssEntry] } },
      }),
      {
        apply(compiler) {
          compiler.hooks.thisCompilation.tap('observe-encoder-input', (compilation) => {
            compilation.hooks.processAssets.tap({
              name: 'observe-encoder-input',
              stage: webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_HASH,
            }, () => {
              let source = ''
              for (const module of compilation.modules) {
                if (module instanceof webpack.NormalModule && module.resource === palette) {
                  source = module.originalSource()?.source().toString() ?? ''
                }
              }
              compilationReceipts.set(compilation, {
                source,
                css: compilation.getAsset('theme.css')!.source.source().toString(),
              })
            })
          })
        },
      },
    ],
  })
  let pending = createSourceBuildReceipt(sourceMarker(0))
  let expectedChange: string | undefined
  const builds: Array<{ changes: string[], paletteDependency: boolean, unknownConsumer: boolean, paletteModuleSource?: string | undefined }> = []
  const watcher = compiler.watch({ aggregateTimeout: 10 }, (error, stats) => {
    const receipt = stats && compilationReceipts.get(stats.compilation)
    builds.push({
      changes: [...compiler.modifiedFiles ?? []],
      paletteDependency: stats?.compilation.fileDependencies.has(palette) ?? false,
      unknownConsumer: receipt?.css.includes('font-family: var(--tw-gradient-position)') ?? false,
      paletteModuleSource: receipt?.source,
    })
    if (error || !stats || stats.hasErrors()) {
      pending.reject(error ?? new Error(stats?.toString({ all: false, errors: true }) ?? '缺少构建结果'))
    }
    else if (!expectedChange || [...compiler.modifiedFiles ?? []].some(file => path.resolve(file) === expectedChange)) {
      if (receipt) {
        pending.accept(receipt)
      }
    }
  })
  const next = async (revision = 0, extra = '') => {
    const content = revision === 0 ? undefined : paletteSource(revision, extra)
    if (content !== undefined) {
      pending = createSourceBuildReceipt(sourceMarker(revision))
      expectedChange = palette
    }
    const timeout = setTimeout(() => pending.reject(new Error(`Webpack 未响应本轮导入变更：${JSON.stringify({ expectedChange, builds })}`)), 20_000)
    try {
      const result = pending.promise
      if (content !== undefined) {
        await writeFile(palette, content)
      }
      const receipt = await result
      const css = await readFile(path.join(root, 'dist', 'theme.css'), 'utf8')
      expect(css).toBe(receipt.css)
      expect(css).toContain('.author-reset')
      expect(css).toContain('--tw-gradient-position: initial')
      expect(css).toContain('linear-gradient(var(--tw-gradient-stops))')
      expect(css).not.toContain('weapp-tailwindcss webpack-generated-css')
      return css
    }
    finally {
      clearTimeout(timeout)
    }
  }
  try {
    const initial = await next()
    expect(initial).toContain('--tw-gradient-position: to right;')
    expect(initial).not.toContain('--tw-gradient-position: to right in oklab;')
    const unknown = await next(1, '.author { font-family: var(--tw-gradient-position); }')
    expect(unknown).toContain('--tw-gradient-position: to right in oklab;')
    expect(unknown).toContain('font-family: var(--tw-gradient-position)')
    const restored = await next(2)
    expect(restored).toContain('--tw-gradient-position: to right;')
    expect(restored).not.toContain('--tw-gradient-position: to right in oklab;')
    expect(restored).not.toContain('font-family: var(--tw-gradient-position)')
  }
  catch (error) {
    throw new Error(`${String(error)}\nWebpack watch trace: ${JSON.stringify({ expectedChange, builds })}`, { cause: error })
  }
  finally {
    if (watcher) {
      await new Promise<void>((resolve, reject) => watcher.close(error => error ? reject(error) : resolve()))
    }
    await new Promise<void>((resolve, reject) => compiler.close(error => error ? reject(error) : resolve()))
    await rm(root, { recursive: true, force: true })
  }
}, 90_000)
