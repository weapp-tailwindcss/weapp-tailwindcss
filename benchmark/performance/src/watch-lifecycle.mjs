import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { summarize } from './stats.mjs'
import { closeWatchResources, createWatchControl, runWatchOperation } from './watch-lifecycle/control.mjs'

/** 复用真实编译契约的双 CSS 入口，整个样本序列保留同一 watcher。 */
export async function measureWatchLifecycle({ sourceRoot, kind, size, warmups, runs, signal }) {
  const require = createRequire(path.join(sourceRoot, 'package.json'))
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-watch-perf-')))
  const output = path.join(root, 'dist')
  let close = async () => {}
  const control = createWatchControl(kind, signal, root)
  const write = (file, content) => {
    control.assertActive()
    return fs.writeFile(path.join(root, file), content)
  }
  return runWatchOperation(control, async () => {
    await fs.symlink(path.join(sourceRoot, 'node_modules'), path.join(root, 'node_modules'), 'junction')
    const baseCss = '@import "tailwindcss" source(none); @source "./view.html"; @config "./theme.cjs";'
    const mainCss = `${baseCss}\n.author-main{width:17px}`
    const template = Array.from({ length: size }, (_, index) => `<div class="bg-accent w-[${index + 1}px]"></div>`).join('\n')
    const config = color => `module.exports = {theme: {extend: {colors: {accent: "${color}"}}}}`
    await Promise.all([
      write('main.js', 'import "./main.css"'), write('secondary.js', 'import "./secondary.css"'),
      write('main.css', mainCss), write('secondary.css', `${baseCss}\n.author-secondary{height:19px}`),
      write('view.html', template), write('theme.cjs', config('#123456')),
    ])
    control.assertActive()
    const options = { tailwindcssBasedir: root, cssEntries: [path.join(root, 'main.css'), path.join(root, 'secondary.css')], generator: { target: 'web', hmr: { preserveDeletedCss: false } } }
    const started = performance.now()
    if (kind === 'vite') {
      const { build } = await import(pathToFileURL(require.resolve('vite')).href)
      const { WeappTailwindcss } = require('weapp-tailwindcss/vite')
      control.assertActive()
      const watcher = await build({
        configFile: false, root, logLevel: 'silent', plugins: [WeappTailwindcss(options), {
          name: 'benchmark-current-css-assets',
          writeBundle: { order: 'post', handler(_options, bundle) {
            control.css = Object.values(bundle).filter(asset => asset.type === 'asset' && asset.fileName.endsWith('.css')).sort((a, b) => a.fileName.localeCompare(b.fileName)).map(asset => String(asset.source)).join('\n')
          } },
        }],
        build: {
          outDir: output, emptyOutDir: false, watch: {}, minify: false, cssMinify: false,
          rollupOptions: { input: { main: path.join(root, 'main.js'), secondary: path.join(root, 'secondary.js') }, output: { assetFileNames: '[name][extname]' } },
        },
      })
      close = () => watcher.close()
      watcher.on('event', (event) => {
        if (event.code === 'END') { control.notify() }
        if (event.code === 'ERROR') { control.notify(event.error) }
      })
    }
    else {
      const webpack = require('webpack')
      const { WeappTailwindcss } = require('weapp-tailwindcss/webpack')
      const compiler = webpack({
        mode: 'development', context: root, devtool: false, cache: false,
        entry: { main: './main.js', secondary: './secondary.js' },
        output: { path: output, filename: '[name].js' },
        module: { rules: [{ test: /\.css$/, type: 'asset/resource', generator: { filename: '[name][ext]' } }] },
        plugins: [new WeappTailwindcss(options), {
          apply(compiler) {
            compiler.hooks.thisCompilation.tap('BenchmarkCurrentCssAssets', (compilation) => {
              compilation.hooks.afterProcessAssets.tap('BenchmarkCurrentCssAssets', () => {
                control.css = compilation.getAssets().filter(asset => asset.name.endsWith('.css')).sort((a, b) => a.name.localeCompare(b.name)).map(asset => String(asset.source.source())).join('\n')
              })
            })
          },
        }],
      })
      const closeCompiler = () => new Promise((resolve, reject) => compiler.close(error => error ? reject(error) : resolve()))
      close = closeCompiler
      // watch 回调早于下一轮监听注册；afterDone 后让 nextTick 完成，才能写下一份输入。
      compiler.hooks.afterDone.tap('BenchmarkWatchReady', (stats) => {
        setImmediate(() => control.notify(stats.hasErrors() ? new Error(stats.toString({ all: false, errors: true })) : undefined))
      })
      const watcher = compiler.watch({ aggregateTimeout: 5 }, (error) => {
        if (error) { control.notify(error) }
      })
      close = () => closeWatchResources([
        () => new Promise((resolve, reject) => watcher.close(error => error ? reject(error) : resolve())),
        closeCompiler,
      ])
    }
    await control.nextBuild(0)
    const startupMs = performance.now() - started
    const initial = control.css
    assert(initial.includes('author-main') && initial.includes('author-secondary'), '两个样式入口均须输出')
    const samples = []
    const outputs = []
    const change = async (updates, predicate) => {
      control.setPhase(updates.map(([file, content]) => `${file}:${content.includes('#654321') ? 'blue' : content.includes('#123456') ? 'red' : ''}`).join(','))
      const before = control.completed
      await Promise.all(updates.map(([file, content]) => write(file, content)))
      let observed = before
      for (;;) {
        await control.nextBuild(observed)
        observed = control.completed
        const css = control.css
        if (predicate(css)) { return css }

      }
    }
    for (let index = 0; index < warmups + runs; index++) {
      const start = performance.now()
      await change([['view.html', `${template}\n<div class="z-[9876]"></div>`]], css => /z-index:\s*9876/.test(css))
      await change([['main.css', baseCss]], css => !css.includes('author-main') && css.includes('author-secondary'))
      await change([['theme.cjs', config('#654321')]], css => css.includes('#654321'))
      await change([['theme.cjs', config('#123456')]], css => css.includes('#123456') && !css.includes('#654321'))
      await change([['view.html', template]], css => !/z-index:\s*9876/.test(css))
      const css = await change([['main.css', mainCss]], css => css.includes('author-main') && css.includes('author-secondary'))
      const milliseconds = performance.now() - start
      outputs.push(css)
      globalThis.gc?.()
      samples.push({ milliseconds, heapMb: process.memoryUsage().heapUsed / 1024 ** 2, rssMb: process.memoryUsage().rss / 1024 ** 2, outputHash: createHash('sha256').update(css).digest('hex') })
    }
    const measured = samples.slice(warmups)
    if (new Set(measured.map(sample => sample.outputHash)).size !== 1) {
      const artifacts = await fs.mkdtemp(path.join(os.tmpdir(), 'watch-lifecycle-output-'))
      await Promise.all(outputs.map((css, index) => fs.writeFile(path.join(artifacts, `${index}.css`), css)))
      throw new Error(`恢复后 CSS 产物不一致，证据：${artifacts}`)
    }
    return { kind, size, startupMs, warmups, runs, time: summarize(measured.map(sample => sample.milliseconds)), peakRssMb: process.resourceUsage().maxRSS / 1024, peakHeapMb: Math.max(...measured.map(sample => sample.heapMb)), outputCss: outputs.at(-1), samples }
  }, async () => {
    await close()
    await fs.rm(root, { recursive: true, force: true })
  })
}
