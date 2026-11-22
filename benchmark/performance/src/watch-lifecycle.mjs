import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { summarize } from './stats.mjs'
import { closeWatchResources, createWatchControl, runWatchOperation } from './watch-lifecycle/control.mjs'
import { assertWatchCssAssets } from './watch-lifecycle/css-assets.mjs'

/** 复用真实编译契约的双 CSS 入口，整个样本序列保留同一 watcher。 */
export async function measureWatchLifecycle({ sourceRoot, kind, size, warmups, runs, signal }) {
  const require = createRequire(path.join(sourceRoot, 'package.json'))
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-watch-perf-')))
  const output = path.join(root, 'dist')
  let close = async () => {}
  let closeResource = 'unacquired'
  const control = createWatchControl(kind, signal, root)
  const hmrTimings = []
  let hmrTimingOutput = ''
  const previousHmrTiming = process.env['WEAPP_TW_HMR_TIMING']
  const previousHmrTimingLog = process.env['WEAPP_TW_HMR_TIMING_LOG']
  const originalStdoutWrite = process.stdout.write
  process.env['WEAPP_TW_HMR_TIMING'] = '1'
  process.env['WEAPP_TW_HMR_TIMING_LOG'] = '0'
  process.stdout.write = function (...args) {
    const [chunk, encoding] = args
    const text = typeof chunk === 'string'
      ? chunk
      : Buffer.isBuffer(chunk)
        ? chunk.toString(typeof encoding === 'string' ? encoding : 'utf8')
        : ''
    hmrTimingOutput += text
    const lines = hmrTimingOutput.split('\n')
    hmrTimingOutput = lines.pop() ?? ''
    for (const line of lines) {
      const prefix = '[weapp-tailwindcss:hmr] '
      if (line.startsWith(prefix)) {
        try {
          hmrTimings.push(JSON.parse(line.slice(prefix.length)))
        }
        catch {}
      }
    }
    return originalStdoutWrite.apply(this, args)
  }
  const restoreTimingCapture = () => {
    process.stdout.write = originalStdoutWrite
    if (previousHmrTiming === undefined) {
      delete process.env['WEAPP_TW_HMR_TIMING']
    }
    else {
      process.env['WEAPP_TW_HMR_TIMING'] = previousHmrTiming
    }
    if (previousHmrTimingLog === undefined) {
      delete process.env['WEAPP_TW_HMR_TIMING_LOG']
    }
    else {
      process.env['WEAPP_TW_HMR_TIMING_LOG'] = previousHmrTimingLog
    }
  }
  const write = (file, content) => {
    control.assertActive()
    control.record('write-start', { file })
    return fs.writeFile(path.join(root, file), content).then(() => control.record('write-complete', { file }))
  }
  return runWatchOperation(control, async () => {
    await fs.symlink(path.join(sourceRoot, 'node_modules'), path.join(root, 'node_modules'), 'junction')
    const baseCss = '@import "tailwindcss" source(none); @source "./view.html"; @config "./theme.cjs";'
    const mainCss = `${baseCss}\n.author-main{width:17px}`
    const template = Array.from({ length: size }, (_, index) => `<div class="bg-accent w-[${index + 1}px]"></div>`).join('\n')
    const config = color => `module.exports = {theme: {extend: {colors: {accent: "${color}"}}}}`
    await Promise.all([
      write('main.js', 'import "./main.css"'),
      write('secondary.js', 'import "./secondary.css"'),
      write('main.css', mainCss),
      write('secondary.css', `${baseCss}\n.author-secondary{height:19px}`),
      write('view.html', template),
      write('theme.cjs', config('#123456')),
    ])
    control.assertActive()
    const options = { tailwindcssBasedir: root, cssEntries: [path.join(root, 'main.css'), path.join(root, 'secondary.css')], generator: { target: 'web', hmr: { preserveDeletedCss: false } } }
    const started = performance.now()
    if (kind === 'vite') {
      const { build } = await import(pathToFileURL(require.resolve('vite')).href)
      const { WeappTailwindcss } = require('weapp-tailwindcss/vite')
      control.assertActive()
      const watcher = await build({
        configFile: false,
        root,
        logLevel: 'silent',
        plugins: [WeappTailwindcss(options), {
          name: 'benchmark-current-css-assets',
          watchChange(file, change) { control.record('watch-change', { file, change: change.event }) },
          buildStart() { control.record('build-start') },
          writeBundle: { order: 'post', handler(_options, bundle) {
            assertWatchCssAssets(bundle)
            control.css = Object.values(bundle).filter(asset => asset.type === 'asset' && asset.fileName.endsWith('.css')).sort((a, b) => a.fileName.localeCompare(b.fileName)).map(asset => String(asset.source)).join('\n')
          } },
        }],
        build: {
          outDir: output,
          emptyOutDir: false,
          watch: {},
          minify: false,
          cssMinify: false,
          rollupOptions: { input: { main: path.join(root, 'main.js'), secondary: path.join(root, 'secondary.js') }, output: { assetFileNames: '[name][extname]' } },
        },
      })
      close = () => watcher.close()
      closeResource = 'vite-watcher'
      watcher.on('event', (event) => {
        control.record('rollup-event', { code: event.code, error: event.error?.message })
        if (event.code === 'END') {
          control.notify()
        }
        if (event.code === 'ERROR') {
          control.notify(event.error)
        }
      })
    }
    else {
      const { WeappTailwindcss } = require('weapp-tailwindcss/webpack')
      const webpack = require('webpack')
      const compiler = webpack({
        mode: 'development',
        context: root,
        devtool: false,
        cache: false,
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
      const closeCompiler = () => new Promise((resolve, reject) => {
        control.record('close-start', { resource: 'webpack-compiler' })
        compiler.close((error) => {
          control.record(error ? 'close-failed' : 'close-complete', { resource: 'webpack-compiler', error: error?.message })
          error ? reject(error) : resolve()
        })
      })
      close = closeCompiler
      closeResource = 'webpack-compiler'
      compiler.hooks.invalid.tap('BenchmarkWatchEvidence', (file, time) => control.record('invalid', { file, time }))
      compiler.hooks.watchRun.tap('BenchmarkWatchEvidence', () => {
        control.record('watch-run', { modified: [...compiler.modifiedFiles ?? []], removed: [...compiler.removedFiles ?? []] })
      })
      const watchFileSystem = compiler.watchFileSystem
      const originalWatch = watchFileSystem.watch
      watchFileSystem.watch = function (...args) {
        const result = originalWatch.apply(this, args)
        control.record('watch-attached', { startTime: args[3] })
        return result
      }
      // watch 回调早于下一轮监听注册；afterDone 后让 nextTick 完成，才能写下一份输入。
      compiler.hooks.afterDone.tap('BenchmarkWatchReady', (stats) => {
        setImmediate(() => control.notify(stats.hasErrors() ? new Error(stats.toString({ all: false, errors: true })) : undefined))
      })
      const watcher = compiler.watch({ aggregateTimeout: 5 }, (error) => {
        if (error) {
          control.notify(error)
        }
      })
      close = () => closeWatchResources([
        () => new Promise((resolve, reject) => {
          control.record('close-start', { resource: 'webpack-watcher' })
          watcher.close((error) => {
            control.record(error ? 'close-failed' : 'close-complete', { resource: 'webpack-watcher', error: error?.message })
            error ? reject(error) : resolve()
          })
        }),
        closeCompiler,
      ])
      closeResource = 'webpack-resources'
    }
    await control.nextBuild(0)
    const startupMs = performance.now() - started
    const initial = control.css
    assert(initial.includes('author-main') && initial.includes('author-secondary'), '两个样式入口均须输出')
    const samples = []
    const outputs = []
    const change = async (id, updates, predicate) => {
      control.setPhase(id)
      const before = control.completed
      const startedAt = performance.now()
      const timingStart = hmrTimings.length
      await Promise.all(updates.map(([file, content]) => write(file, content)))
      let observed = before
      for (;;) {
        await control.nextBuild(observed)
        observed = control.completed
        const css = control.css
        if (predicate(css)) {
          const result = {
            id,
            milliseconds: performance.now() - startedAt,
            outputHash: createHash('sha256').update(css).digest('hex'),
            timings: hmrTimings.slice(timingStart),
          }
          control.record('change-measured', result)
          return { ...result, css }
        }
      }
    }
    for (let index = 0; index < warmups + runs; index++) {
      const start = performance.now()
      const changes = []
      changes.push(await change('add-candidate', [['view.html', `${template}\n<div class="z-[9876]"></div>`]], css => /z-index:\s*9876/.test(css)))
      changes.push(await change('remove-author-css', [['main.css', baseCss]], css => !css.includes('author-main') && css.includes('author-secondary')))
      changes.push(await change('change-theme', [['theme.cjs', config('#654321')]], css => css.includes('#654321')))
      changes.push(await change('restore-theme', [['theme.cjs', config('#123456')]], css => css.includes('#123456') && !css.includes('#654321')))
      changes.push(await change('remove-candidate', [['view.html', template]], css => !/z-index:\s*9876/.test(css)))
      changes.push(await change('restore-author-css', [['main.css', mainCss]], css => css.includes('author-main') && css.includes('author-secondary')))
      const css = changes.at(-1).css
      const milliseconds = performance.now() - start
      control.record('sample-restored', { index })
      outputs.push(css)
      globalThis.gc?.()
      samples.push({ milliseconds, heapMb: process.memoryUsage().heapUsed / 1024 ** 2, rssMb: process.memoryUsage().rss / 1024 ** 2, outputHash: createHash('sha256').update(css).digest('hex'), changes: changes.map(({ id, milliseconds: changeMs, outputHash, timings }) => ({ id, milliseconds: changeMs, outputHash, timings })) })
      control.record('sample-created', { index })
    }
    const measured = samples.slice(warmups)
    if (new Set(measured.map(sample => sample.outputHash)).size !== 1) {
      const artifacts = await fs.mkdtemp(path.join(os.tmpdir(), 'watch-lifecycle-output-'))
      await Promise.all(outputs.map((css, index) => fs.writeFile(path.join(artifacts, `${index}.css`), css)))
      throw new Error(`恢复后 CSS 产物不一致，证据：${artifacts}`)
    }
    const changeIds = samples[0]?.changes.map(change => change.id) ?? []
    for (const id of changeIds) {
      const hashes = new Set(samples.map(sample => sample.changes.find(change => change.id === id)?.outputHash))
      if (hashes.size !== 1 || hashes.has(undefined)) {
        throw new Error(`变更 ${id} 的 CSS 产物哈希不稳定。`)
      }
    }
    const changeTimings = Object.fromEntries(changeIds.map(id => [
      id,
      summarize(measured.map(sample => sample.changes.find(change => change.id === id).milliseconds)),
    ]))
    const hmrPhaseTimings = Object.fromEntries(changeIds.map((id) => {
      const phaseSamples = new Map()
      for (const sample of measured) {
        for (const timing of sample.changes.find(change => change.id === id).timings) {
          const values = phaseSamples.get(timing.phase) ?? []
          values.push(timing.durationMs)
          phaseSamples.set(timing.phase, values)
        }
      }
      return [id, Object.fromEntries([...phaseSamples].map(([phase, values]) => [phase, summarize(values)]))]
    }))
    control.record('report-start')
    const report = { kind, size, startupMs, warmups, runs, watchReceipt: control.receipt, time: summarize(measured.map(sample => sample.milliseconds)), changeTimings, hmrPhaseTimings, peakRssMb: process.resourceUsage().maxRSS / 1024, peakHeapMb: Math.max(...measured.map(sample => sample.heapMb)), outputCss: outputs.at(-1), samples }
    control.record('report-created')
    return report
  }, async () => {
    const resource = closeResource
    control.record('close-start', { resource })
    try {
      await close()
      control.record('close-complete', { resource })
    }
    catch (error) {
      control.record('close-failed', { resource, error: error?.message })
      throw error
    }
    finally {
      restoreTimingCapture()
    }
    control.record('remove-start')
    try {
      await fs.rm(root, { recursive: true, force: true })
      control.record('remove-complete')
    }
    catch (error) {
      control.record('remove-failed', { error: error?.message })
      throw error
    }
  })
}
