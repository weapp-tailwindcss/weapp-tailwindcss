import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import webpack from 'webpack'
import { preserveWebsiteCssConditionalOrder } from '../../../../website/config/cssMinimizer'

const require = createRequire(import.meta.url)
const websiteRequire = createRequire(fileURLToPath(new URL('../../../../website/package.json', import.meta.url)))
const coreRequire = createRequire(websiteRequire.resolve('@docusaurus/core/package.json'))
const bundlerRequire = createRequire(coreRequire.resolve('@docusaurus/bundler/package.json'))
const { getMinimizers } = bundlerRequire('./lib/minification.js')
const { createStyleLoadersFactory } = bundlerRequire('./lib/loaders/styleLoader.js')
const { getCSSExtractPlugin } = bundlerRequire('./lib/currentBundler.js')
const { WeappTailwindcss } = require('weapp-tailwindcss/webpack')

const taroRequire = createRequire(fileURLToPath(new URL('../../../../demo/taro-webpack-react-tailwindcss-v4/package.json', import.meta.url)))
const taroRunnerRequire = createRequire(taroRequire.resolve('@tarojs/webpack5-runner/package.json'))
const TaroCssMinimizerPlugin = taroRunnerRequire('css-minimizer-webpack-plugin')

async function createWebFixture(options: { sourceMap?: boolean, cssSourceTrace?: boolean, taroMinimizer?: boolean } = {}) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'weapp-tw-webpack-web-cascade-')))
  await mkdir(path.join(root, 'node_modules'))
  await symlink(path.dirname(require.resolve('tailwindcss/package.json')), path.join(root, 'node_modules', 'tailwindcss'), process.platform === 'win32' ? 'junction' : 'dir')
  await mkdir(path.join(root, 'parts'))
  const cssEntry = path.join(root, 'theme.css')
  await writeFile(path.join(root, 'entry.js'), 'import "./theme.css"')
  const template = '<main class="h-[137px] underline">late template</main>'
  await writeFile(path.join(root, 'template.html'), template)
  await writeFile(cssEntry, [
    '@import "tailwindcss" source(none);',
    '@theme { --color-white: #ffffff; --color-slate-900: #123456; --color-slate-800: #654321; --color-sky-200: #abcdef; --color-sky-500: #cc2200; --color-sky-300: #22cc00; }',
    '@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));',
    '@source inline("bg-white/80 dark:bg-slate-900/75 from-sky-200/85 dark:from-slate-800 fill-sky-500/50 dark:fill-sky-300/50");',
    '@source "./template.html";',
    '@source "./parts/*.html";',
    '@layer utilities { @supports (color: color-mix(in lab, red, red)) { .site-panel { display: grid } } }',
  ].join('\n'))
  const minimizers = await getMinimizers({
    currentBundler: { name: 'webpack' },
    faster: { swcJsMinimizer: false, lightningCssMinimizer: false },
  })
  const getStyleLoaders = await createStyleLoadersFactory({ currentBundler: { name: 'webpack' } })
  const MiniCssExtractPlugin = await getCSSExtractPlugin({ currentBundler: { name: 'webpack' } })
  let optimizedCss: string | undefined
  let generatedCss: string | undefined
  let frameworkCss: { css: string, map: unknown } | undefined
  const compiler = webpack({
    mode: 'production',
    devtool: options.sourceMap ? 'source-map' : false,
    context: root,
    entry: './entry.js',
    output: { path: path.join(root, 'dist'), filename: 'entry.js' },
    module: { rules: [{ test: /\.css$/, use: getStyleLoaders(false) }] },
    optimization: { minimizer: options.taroMinimizer
      ? [new TaroCssMinimizerPlugin({
          minify: TaroCssMinimizerPlugin.cssnanoMinify,
          minimizerOptions: { preset: ['default', { mergeRules: false, mergeIdents: false, reduceIdents: false, discardUnused: false, minifySelectors: false }] },
        })]
      : preserveWebsiteCssConditionalOrder(minimizers) },
    plugins: [
      new MiniCssExtractPlugin({ filename: 'theme.css' }),
      new WeappTailwindcss({
        generator: { target: 'web' },
        tailwindcssBasedir: root,
        cssSourceTrace: options.cssSourceTrace ? { root } : false,
        tailwindcss: { v4: { base: root, cssEntries: [cssEntry] } },
      }),
      {
        apply(compiler) {
          compiler.hooks.thisCompilation.tap('capture-optimized-css', (compilation) => {
            compilation.hooks.processAssets.tap({
              name: 'capture-generated-css',
              stage: webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE + 1,
            }, () => {
              generatedCss = compilation.getAsset('theme.css')?.source.source().toString()
            })
            compilation.hooks.processAssets.tap({
              name: 'capture-framework-css-source',
              stage: webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE - 1,
            }, () => {
              const source = compilation.getAsset('theme.css')?.source
              if (source) {
                frameworkCss = { css: source.source().toString(), map: source.map() }
              }
            })
            // 模板产物比 CSS 压缩更晚发出，候选仍由显式来源和扫描层获取。
            compilation.hooks.processAssets.tap({
              name: 'emit-late-template',
              stage: webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_INLINE,
            }, () => compilation.emitAsset('index.html', new webpack.sources.RawSource(template)))
            compilation.hooks.processAssets.tap({
              name: 'capture-optimized-css',
              stage: webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE + 1,
            }, () => {
              optimizedCss = compilation.getAsset('theme.css')?.source.source().toString()
            })
          })
        },
      },
    ],
  })
  return { root, compiler, cssEntry, template, generatedCss: () => generatedCss, optimizedCss: () => optimizedCss, frameworkCss: () => frameworkCss }
}

it('在生产压缩之前完成 Web CSS 生成，不在压缩后重新插入基础 utility', async () => {
  const fixture = await createWebFixture()
  const { root, compiler, template } = fixture
  try {
    const stats = await new Promise<webpack.Stats | undefined>((resolve, reject) => {
      compiler.run((error, stats) => error ? reject(error) : resolve(stats))
    })
    expect(stats?.hasErrors(), stats?.toString({ all: false, errors: true })).toBe(false)
    const css = await readFile(path.join(root, 'dist', 'theme.css'), 'utf8')
    expect(fixture.optimizedCss()).toBeDefined()
    expect(fixture.optimizedCss()).toContain('.site-panel')
    expect(fixture.optimizedCss()).toContain('.h-\\[137px\\]')
    expect(await readFile(path.join(root, 'dist', 'index.html'), 'utf8')).toBe(template)
    // 压缩后的资产必须保持原样，不能再用一份未压缩的生成结果覆盖优化器的产物图。
    expect(css === fixture.optimizedCss(), '最终 CSS 应保持生产优化器已完成的资产内容').toBe(true)
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage()
      await page.setContent(`<style>${css}</style>
        <div id="panel" class="bg-white/80 dark:bg-slate-900/75"></div>
        <div id="gradient" class="from-sky-200/85 dark:from-slate-800"></div>
        <svg id="icon" class="fill-sky-500/50 dark:fill-sky-300/50"></svg>`)
      for (const mode of ['light', 'dark', 'light']) {
        const colors = await page.evaluate((mode) => {
          document.documentElement.dataset.theme = mode
          const context = document.createElement('canvas').getContext('2d')!
          const raster = (value: string) => {
            context.clearRect(0, 0, 1, 1)
            context.fillStyle = value
            context.fillRect(0, 0, 1, 1)
            return [...context.getImageData(0, 0, 1, 1).data]
          }
          return {
            panel: raster(getComputedStyle(document.querySelector('#panel')!).backgroundColor),
            gradient: raster(getComputedStyle(document.querySelector('#gradient')!).getPropertyValue('--tw-gradient-from')),
            icon: raster(getComputedStyle(document.querySelector('#icon')!).fill),
            expected: mode === 'dark'
              ? { panel: raster('#123456bf'), gradient: raster('#654321'), icon: raster('#22cc0080') }
              : { panel: raster('#ffffffcc'), gradient: raster('#abcdefd9'), icon: raster('#cc220080') },
          }
        }, mode)
        for (const key of ['panel', 'gradient', 'icon'] as const) {
          expect(colors[key], `${mode}/${key}`).toEqual(colors.expected[key])
        }
      }
    }
    finally {
      await browser.close()
    }
  }
  finally {
    await new Promise<void>((resolve, reject) => compiler.close(error => error ? reject(error) : resolve()))
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)

it('显式开启的来源注释经过 Taro 默认生产压缩器后仍保留，且不覆盖优化后的 CSS', async () => {
  const fixture = await createWebFixture({ cssSourceTrace: true, taroMinimizer: true })
  const { root, compiler } = fixture
  try {
    const stats = await new Promise<webpack.Stats | undefined>((resolve, reject) => {
      compiler.run((error, stats) => error ? reject(error) : resolve(stats))
    })
    expect(stats?.hasErrors(), stats?.toString({ all: false, errors: true })).toBe(false)
    const css = await readFile(path.join(root, 'dist', 'theme.css'), 'utf8')
    expect(fixture.generatedCss()).toContain('tokens: underline <= template.html')
    expect(css).toMatch(/\/\*!\s*tokens:\s*underline\s*<=\s*template\.html\s*\*\//)
    expect(css).toContain('text-decoration-line:underline')
    expect(css).toContain('.h-\\[137px\\]')
    expect(css).toBe(fixture.optimizedCss())
  }
  finally {
    await new Promise<void>((resolve, reject) => compiler.close(error => error ? reject(error) : resolve()))
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)

it('压缩器显式删除全部注释时尊重配置，不在压缩后重新注入来源', async () => {
  const fixture = await createWebFixture({ cssSourceTrace: true })
  const { root, compiler } = fixture
  try {
    const stats = await new Promise<webpack.Stats | undefined>((resolve, reject) => {
      compiler.run((error, stats) => error ? reject(error) : resolve(stats))
    })
    expect(stats?.hasErrors(), stats?.toString({ all: false, errors: true })).toBe(false)
    expect(fixture.generatedCss()).toContain('tokens: underline <= template.html')
    const css = await readFile(path.join(root, 'dist', 'theme.css'), 'utf8')
    expect(css).not.toContain('tokens:')
    expect(css).toBe(fixture.optimizedCss())
  }
  finally {
    await new Promise<void>((resolve, reject) => compiler.close(error => error ? reject(error) : resolve()))
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)

it('在生产处理和压缩之后仍能追溯框架 CSS loader 的 source map', async () => {
  const fixture = await createWebFixture({ sourceMap: true, cssSourceTrace: true, taroMinimizer: true })
  const { root, compiler } = fixture
  try {
    const stats = await new Promise<webpack.Stats | undefined>((resolve, reject) => {
      compiler.run((error, stats) => error ? reject(error) : resolve(stats))
    })
    expect(stats?.hasErrors(), stats?.toString({ all: false, errors: true })).toBe(false)
    const css = await readFile(path.join(root, 'dist', 'theme.css'), 'utf8')
    expect(css).toContain('tokens: underline <= template.html')
    expect(css).toContain('sourceMappingURL=theme.css.map')
    const map = JSON.parse(await readFile(path.join(root, 'dist', 'theme.css.map'), 'utf8'))
    expect(map.mappings.length).toBeGreaterThan(0)
    expect(map.sources.some((source: string) => source.endsWith('theme.css'))).toBe(true)
    expect(map.sourcesContent.some((source: string) => source.includes('.site-panel'))).toBe(true)
    const positionOf = (text: string, token: string) => {
      const offset = text.indexOf(token)
      expect(offset).toBeGreaterThanOrEqual(0)
      const lines = text.slice(0, offset).split('\n')
      return { line: lines.length, column: lines.at(-1)!.length }
    }
    const framework = fixture.frameworkCss()!
    const expected = originalPositionFor(new TraceMap(framework.map as ConstructorParameters<typeof TraceMap>[0]), positionOf(framework.css, '.site-panel'))
    const actual = originalPositionFor(new TraceMap(map), positionOf(css, '.site-panel'))
    expect(expected.source).toMatch(/theme\.css$/)
    expect(actual.source).toMatch(/theme\.css$/)
    expect({ line: actual.line, column: actual.column }).toEqual({ line: expected.line, column: expected.column })
  }
  finally {
    await new Promise<void>((resolve, reject) => compiler.close(error => error ? reject(error) : resolve()))
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)

it('真实 Web watch 在来源新增、替换、删除和主题变值后保留框架处理结果', async () => {
  const fixture = await createWebFixture()
  const { root, compiler, cssEntry } = fixture
  const browser = await chromium.launch({ headless: true })
  let pending = Promise.withResolvers<webpack.Stats>()
  let expectedChange: string | undefined
  let phase = 'initial'
  let build = 0
  const events: unknown[] = []
  const startedAt = Date.now()
  const record = (event: string, detail: object = {}) => events.push({ at: Date.now() - startedAt, event, phase, build, ...detail })
  const watchFileSystem = compiler.watchFileSystem!
  const originalWatch = watchFileSystem.watch
  watchFileSystem.watch = function (...args) {
    const result = originalWatch.apply(this, args)
    record('attached', { startTime: args[3] })
    return result
  }
  compiler.hooks.watchRun.tap('cascade-watch-evidence', () => {
    record('watchRun', { modified: [...compiler.modifiedFiles ?? []], removed: [...compiler.removedFiles ?? []] })
  })
  compiler.hooks.invalid.tap('cascade-watch-evidence', (file, time) => record('invalid', { file, time }))
  const watcher = compiler.watch({ aggregateTimeout: 10 }, (error, stats) => {
    build += 1
    const changes = [...compiler.modifiedFiles ?? [], ...compiler.removedFiles ?? []]
    const matchesChange = !expectedChange || changes.some(file => path.resolve(file) === path.resolve(expectedChange!))
    record('callback', {
      changes,
      expectedChange,
      matchesChange,
      hasErrors: stats?.hasErrors(),
      error: error?.message,
      themeDependency: stats?.compilation.fileDependencies.has(cssEntry),
      generatedCss: fixture.generatedCss(),
      optimizedCss: fixture.optimizedCss(),
    })
    if (error || !stats || stats.hasErrors()) {
      pending.reject(error ?? new Error(stats?.toString({ all: false, errors: true }) ?? '缺少构建结果'))
    }
    else {
      // 文件系统可额外报告输出目录的首次创建，只消费明确属于本轮编辑的构建。
      if (!matchesChange) {
        return
      }
      pending.resolve(stats)
    }
  })
  const next = async (change?: { phase: string, file: string, edit: () => Promise<unknown> }) => {
    if (change) {
      phase = change.phase
      pending = Promise.withResolvers<webpack.Stats>()
      expectedChange = change.file
    }
    const result = pending.promise
    const timeout = setTimeout(() => pending.reject(new Error(`Web watch 没有响应本轮来源变化：${change?.file ?? '初次构建'}`)), 20_000)
    try {
      record('edit-start', { file: change?.file })
      await change?.edit()
      record('edit-complete', { file: change?.file })
      await result
      const css = await readFile(path.join(root, 'dist', 'theme.css'), 'utf8')
      expect(css).toBe(fixture.optimizedCss())
      expect(css).toContain('.site-panel')
      pending = Promise.withResolvers<webpack.Stats>()
      return css
    }
    finally {
      clearTimeout(timeout)
    }
  }
  try {
    const page = await browser.newPage()
    const assertHeight = async (css: string, height: number, color: string) => {
      await page.setContent(`<style>${css}</style><div id="probe" class="h-[${height}px] bg-white/80 dark:bg-slate-900/75"></div>`)
      await page.evaluate(() => {
        document.documentElement.dataset.theme = 'dark'
      })
      const result = await page.locator('#probe').evaluate((element, reference) => {
        const context = document.createElement('canvas').getContext('2d')!
        const raster = (value: string) => {
          context.clearRect(0, 0, 1, 1)
          context.fillStyle = value
          context.fillRect(0, 0, 1, 1)
          return [...context.getImageData(0, 0, 1, 1).data]
        }
        return { height: element.getBoundingClientRect().height, actual: raster(getComputedStyle(element).backgroundColor), expected: raster(reference) }
      }, color)
      expect(result.height).toBe(height)
      expect(result.actual).toEqual(result.expected)
    }
    await assertHeight(await next(), 137, 'rgba(18, 52, 86, 0.75)')
    const template = path.join(root, 'template.html')
    let css = await next({ phase: 'replace-template', file: template, edit: () => writeFile(template, '<div class="h-[138px]"></div>') })
    expect(css).not.toContain('.h-\\[137px\\]')
    await assertHeight(css, 138, 'rgba(18, 52, 86, 0.75)')
    const extra = path.join(root, 'parts', 'new.html')
    css = await next({ phase: 'add-source', file: path.dirname(extra), edit: () => writeFile(extra, '<div class="w-[39px]"></div>') })
    expect(css).toContain('.w-\\[39px\\]')
    css = await next({ phase: 'remove-source', file: extra, edit: () => rm(extra) })
    expect(css).not.toContain('.w-\\[39px\\]')
    const original = await readFile(cssEntry, 'utf8')
    css = await next({ phase: 'change-theme', file: cssEntry, edit: () => writeFile(cssEntry, original.replace('--color-slate-900: #123456', '--color-slate-900: #345678')) })
    await assertHeight(css, 138, 'rgba(52, 86, 120, 0.75)')
    css = await next({ phase: 'restore-theme', file: cssEntry, edit: () => writeFile(cssEntry, original) })
    await assertHeight(css, 138, 'rgba(18, 52, 86, 0.75)')
  }
  catch (error) {
    throw new Error(`${String(error)}\nCascade watch trace: ${JSON.stringify({ expectedChange, events })}`, { cause: error })
  }
  finally {
    await browser.close()
    await new Promise<void>((resolve, reject) => watcher.close(error => error ? reject(error) : resolve()))
    await new Promise<void>((resolve, reject) => compiler.close(error => error ? reject(error) : resolve()))
    await rm(root, { recursive: true, force: true })
  }
}, 120_000)
