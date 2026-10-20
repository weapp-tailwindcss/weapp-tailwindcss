import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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

async function createWebFixture() {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'weapp-tw-webpack-web-cascade-')))
  await mkdir(path.join(root, 'node_modules'))
  await symlink(path.dirname(require.resolve('tailwindcss/package.json')), path.join(root, 'node_modules', 'tailwindcss'), process.platform === 'win32' ? 'junction' : 'dir')
  await mkdir(path.join(root, 'parts'))
  const cssEntry = path.join(root, 'theme.css')
  await writeFile(path.join(root, 'entry.js'), 'import "./theme.css"')
  const template = '<main class="h-[137px]">late template</main>'
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
  const compiler = webpack({
    mode: 'production',
    context: root,
    entry: './entry.js',
    output: { path: path.join(root, 'dist'), filename: 'entry.js' },
    module: { rules: [{ test: /\.css$/, use: getStyleLoaders(false) }] },
    optimization: { minimizer: preserveWebsiteCssConditionalOrder(minimizers) },
    plugins: [
      new MiniCssExtractPlugin({ filename: 'theme.css' }),
      new WeappTailwindcss({
        generator: { target: 'web' },
        tailwindcss: { v4: { base: root, cssEntries: [cssEntry] } },
      }),
      {
        apply(compiler) {
          compiler.hooks.thisCompilation.tap('capture-optimized-css', (compilation) => {
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
  return { root, compiler, cssEntry, template, optimizedCss: () => optimizedCss }
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

it('真实 Web watch 在来源新增、替换、删除和主题变值后保留框架处理结果', async () => {
  const fixture = await createWebFixture()
  const { root, compiler, cssEntry } = fixture
  const browser = await chromium.launch({ headless: true })
  let pending = Promise.withResolvers<webpack.Stats>()
  let expectedChange: string | undefined
  const watcher = compiler.watch({ aggregateTimeout: 10 }, (error, stats) => {
    if (error || !stats || stats.hasErrors()) {
      pending.reject(error ?? new Error(stats?.toString({ all: false, errors: true }) ?? '缺少构建结果'))
    }
    else {
      // 文件系统可额外报告输出目录的首次创建，只消费明确属于本轮编辑的构建。
      const changes = [...compiler.modifiedFiles ?? [], ...compiler.removedFiles ?? []]
      if (expectedChange && !changes.some(file => path.resolve(file) === path.resolve(expectedChange!))) {
        return
      }
      pending.resolve(stats)
    }
  })
  const next = async (change?: { file: string, edit: () => Promise<unknown> }) => {
    if (change) {
      pending = Promise.withResolvers<webpack.Stats>()
      expectedChange = change.file
    }
    const result = pending.promise
    const timeout = setTimeout(() => pending.reject(new Error(`Web watch 没有响应本轮来源变化：${change?.file ?? '初次构建'}`)), 20_000)
    try {
      await change?.edit()
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
      await page.evaluate(() => { document.documentElement.dataset.theme = 'dark' })
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
    let css = await next({ file: template, edit: () => writeFile(template, '<div class="h-[138px]"></div>') })
    expect(css).not.toContain('.h-\\[137px\\]')
    await assertHeight(css, 138, 'rgba(18, 52, 86, 0.75)')
    const extra = path.join(root, 'parts', 'new.html')
    css = await next({ file: path.dirname(extra), edit: () => writeFile(extra, '<div class="w-[39px]"></div>') })
    expect(css).toContain('.w-\\[39px\\]')
    css = await next({ file: extra, edit: () => rm(extra) })
    expect(css).not.toContain('.w-\\[39px\\]')
    const original = await readFile(cssEntry, 'utf8')
    css = await next({ file: cssEntry, edit: () => writeFile(cssEntry, original.replace('--color-slate-900: #123456', '--color-slate-900: #345678')) })
    await assertHeight(css, 138, 'rgba(52, 86, 120, 0.75)')
    css = await next({ file: cssEntry, edit: () => writeFile(cssEntry, original) })
    await assertHeight(css, 138, 'rgba(18, 52, 86, 0.75)')
  }
  finally {
    await browser.close()
    await new Promise<void>((resolve, reject) => watcher.close(error => error ? reject(error) : resolve()))
    await new Promise<void>((resolve, reject) => compiler.close(error => error ? reject(error) : resolve()))
    await rm(root, { recursive: true, force: true })
  }
}, 120_000)
