import { mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { rollupTestRequire } from './rollup-test-runtime.mjs'
import { getWatchPathEntry } from './rollup-watch-paths.mjs'
import { replaceSourceFile } from './source-file.mjs'

describe.each(['uni-app-vite-tailwindcss-v4', 'issue-uview-plus-cssentries', 'taro-vite-react-tailwindcss-v4'])('%s Rollup', (demo) => {
  const viteRequire = rollupTestRequire(demo)
  const rollupDist = path.dirname(viteRequire.resolve('rollup'))

  it('deduplicates identical notifications without dropping new file states', async () => {
    const { chokidar } = viteRequire(path.join(rollupDist, 'shared/index.js'))
    const watcher = chokidar.watch([], { ignoreInitial: true })
    const file = path.join(tmpdir(), 'rollup-change-probe.json')
    const events = []
    watcher.on('change', (_, stats) => events.push(stats))
    const initial = { dev: 1, ino: 1, size: 10, mtimeMs: 1, ctimeMs: 1 }
    try {
      await watcher._emit('change', file, initial)
      await watcher._emit('change', file, { ...initial })
      expect(events).toEqual([initial])
      for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
        const changed = { ...events.at(-1), [key]: events.at(-1)[key] + 1 }
        await watcher._emit('change', file, changed)
        expect(events.at(-1)).toEqual(changed)
        const count = events.length
        await watcher._emit('change', file, { ...changed })
        expect(events).toHaveLength(count)
      }
      expect(events).toHaveLength(6)
    }
    finally { await watcher.close() }
  })

  const scenarios = ['cjs', 'esm'].flatMap(format => ['file', 'directory'].map(dependency => ({ format, dependency, delayed: false })))
  if (demo.startsWith('taro-')) {
    scenarios.push({ format: 'esm', dependency: 'directory', delayed: true })
  }
  it.each(scenarios)('preserves transform invalidation received during an unfinished build ($format, $dependency, delayed=$delayed)', async ({ format, dependency, delayed }) => {
    const rollup = format === 'cjs'
      ? viteRequire('rollup')
      : await import(pathToFileURL(path.join(rollupDist, 'es/rollup.js')).href)
    const dir = await realpath(await mkdtemp(path.join(tmpdir(), 'rollup-inflight-')))
    const entry = path.join(dir, 'entry.js')
    const dataDir = path.join(dir, 'data')
    const data = path.join(dataDir, 'value.json')
    const output = path.join(dir, 'bundle.mjs')
    let reached = false
    const release = Promise.withResolvers()
    const invalidated = []
    const trace = []
    const record = (type, detail) => {
      if (trace.length < 100) {
        trace.push({ type, detail })
      }
    }
    const registrationGate = Promise.withResolvers()
    let registrationEntered = false
    let registration
    let fsWatcher
    let changeStarted = false
    let firstChange
    const { Task } = format === 'cjs'
      ? viteRequire(path.join(rollupDist, 'shared/watch.js'))
      : await import(pathToFileURL(path.join(rollupDist, 'es/shared/watch.js')).href)
    const run = Task.prototype.run
    const observeRun = vi.spyOn(Task.prototype, 'run').mockImplementation(function (...args) {
      if (!fsWatcher) {
        fsWatcher = this.fileWatcher.watcher
        fsWatcher.on('change', file => record('change', file))
        fsWatcher.on('raw', (event, file, details) => record('raw', { event, file, ino: details?.curr?.ino }))
        if (delayed) {
          const handler = fsWatcher._nodeFsHandler
          const add = handler._addToNodeFs
          registration = vi.spyOn(handler, '_addToNodeFs').mockImplementation(async function (file, ...rest) {
            if (path.resolve(file) === data) {
              registrationEntered = true
              await registrationGate.promise
            }
            return add.call(this, file, ...rest)
          })
        }
      }
      return run.apply(this, args)
    })
    // Rollup 3 没有 onInvalidate；在真实任务收到事件时观察，不替代事件或构建。
    const legacyTask = demo.startsWith('taro-')
      ? (format === 'cjs'
          ? viteRequire(path.join(rollupDist, 'shared/watch.js'))
          : await import(pathToFileURL(path.join(rollupDist, 'es/shared/watch.js')).href)).Task
      : undefined
    const invalidate = legacyTask?.prototype.invalidate
    const observer = legacyTask && vi.spyOn(legacyTask.prototype, 'invalidate').mockImplementation(function (id, details) {
      invalidated.push(id)
      record('invalidate', { id, details })
      return invalidate.call(this, id, details)
    })
    let watcher
    let inspection = 0
    const firstBuild = Promise.withResolvers()
    try {
      await mkdir(dataDir)
      await replaceSourceFile(entry, 'export { default } from "virtual:derived"')
      await replaceSourceFile(data, '{"value":0}')
      watcher = rollup.watch({
        input: entry,
        output: { file: output, format: 'es' },
        watch: {
        // 该用例验证构建期间的缓存失效；polling 保证两轮状态都能跨过原生事件去重窗口。
        // 原子替换后的原生监听连续性由 rollup-watch.test.mjs 独立覆盖。
          chokidar: { usePolling: true, interval: 10 },
          ...(legacyTask
            ? {}
            : {
                onInvalidate(id) {
                  invalidated.push(id)
                  record('invalidate', id)
                },
              }),
        },
        plugins: [{
          name: 'inflight-transform-dependency',
          resolveId(id) { return id === 'virtual:derived' ? id : null },
          load(id) { return id === 'virtual:derived' ? 'export default null' : null },
          async transform(_, id) {
            if (id !== 'virtual:derived') {
              return
            }
            this.addWatchFile(dependency === 'directory' ? dataDir : data)
            const { value } = JSON.parse(await readFile(data, 'utf8'))
            record('transform', value)
            if (value === 1) {
              reached = true
              await release.promise
            }
            return `export default ${value * 2}`
          },
        }],
      })
      watcher.on('event', (event) => {
        event.result?.close()
        record('build', { code: event.code, error: event.error?.stack })
        if (event.code === 'END') {
          firstBuild.resolve()
        }
        else if (event.code === 'ERROR') {
          firstBuild.reject(event.error)
        }
      })
      const inspect = value => expect.poll(async () => {
        const module = await import(`${pathToFileURL(output).href}?inspection=${++inspection}`)
        return module.default
      }, { timeout: 5000, interval: 1 }).toBe(value)
      // END 只证明构建结束；目录扫描的叶子订阅仍可能未完成。
      await firstBuild.promise
      await inspect(0)
      if (delayed) {
        await expect.poll(() => registrationEntered, { timeout: 5000, interval: 1 }).toBe(true)
        expect(getWatchPathEntry(fsWatcher._closers, data)).toBeUndefined()
      }
      firstChange = (async () => {
        await expect.poll(() => getWatchPathEntry(fsWatcher?._closers ?? [], data)?.length ?? 0, { timeout: 5000, interval: 1 }).toBeGreaterThan(0)
        record('subscription', data)
        changeStarted = true
        await replaceSourceFile(data, '{"value":1}')
      })()
      if (delayed) {
        // 延迟实际叶子订阅；握手完成前不能开始本用例的首次改写。
        await Promise.resolve()
        expect(changeStarted).toBe(false)
        registrationGate.resolve()
      }
      await firstChange
      await expect.poll(() => reached, { timeout: 5000, interval: 1 }).toBe(true)
      const previous = invalidated.length
      await replaceSourceFile(data, '{"value":2}')
      await expect.poll(() => invalidated.slice(previous), { timeout: 5000, interval: 1 }).toContain(dependency === 'directory' ? dataDir : data)
      release.resolve()
      await inspect(4)
      await replaceSourceFile(data, '{"value":3}')
      await inspect(6)
    }
    catch (error) {
      throw new Error(`${String(error)}\nRollup invalidation trace: ${JSON.stringify({ demo, format, dependency, delayed, subscription: Boolean(getWatchPathEntry(fsWatcher?._closers ?? [], data)?.length), trace })}`, { cause: error })
    }
    finally {
      registrationGate.resolve()
      release.resolve()
      try {
        await firstChange
      }
      finally {
        try {
          await watcher?.close()
        }
        finally {
          registration?.mockRestore()
          observeRun.mockRestore()
          observer?.mockRestore()
          await rm(dir, { recursive: true, force: true })
        }
      }
    }
  }, 15_000)
})
