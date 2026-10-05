import fs from 'node:fs'
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { expect, vi } from 'vitest'
import { rollupTestRequire } from './rollup-test-runtime.mjs'
import { replaceSourceFile } from './source-file.mjs'

const require = rollupTestRequire('taro-vite-react-tailwindcss-v4')
const dist = path.dirname(require.resolve('rollup'))
// 每个 fixture 都调用原生函数，不能捕获上一用例尚未恢复的 spy。
const nativeWatch = fs.watch

async function waitFor(predicate, message, signal) {
  const deadline = performance.now() + 5000
  while (true) {
    signal?.throwIfAborted()
    if (predicate()) {
      return
    }
    if (performance.now() >= deadline) {
      throw new Error(`${message}: no matching event within 5000ms`)
    }
    await setTimeout(1, undefined, { signal })
  }
}

export async function recoveryFixture(format, context, run) {
  const { signal } = context
  signal.throwIfAborted()
  const { Task } = format === 'cjs'
    ? require(path.join(dist, 'shared/watch.js'))
    : await import(pathToFileURL(path.join(dist, 'es/shared/watch.js')).href)
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), 'rollup-recovery-lifecycle-')))
  const dataDir = path.join(dir, 'data')
  const data = path.join(dataDir, 'value.json')
  const entry = path.join(dir, 'entry.js')
  const events = []
  const task = new Task({
    invalidate(event) { events.push(event) },
  }, {
    output: [],
    watch: { chokidar: { atomic: false, useFsEvents: false, usePolling: false } },
  })
  const watcher = task.fileWatcher.watcher
  const listeners = new Map()
  const bindings = new Set()
  const trace = []
  const record = (operation, detail) => {
    trace.push({ operation, detail, at: performance.now(), tracked: watcher._watched.get(dataDir)?.has(path.basename(data)), addThrottle: watcher._throttled.get('add')?.get(data)?.count, pending: typeof watcher._pendingRecreations.get(data)?.closer, closers: [...watcher._closers.keys()] })
    if (trace.length > 100) {
      trace.shift()
    }
  }
  watcher.on('all', (event, file) => record('event', { event, file }))
  const restores = []
  const releases = []
  let beforeNativeWatch
  let stopped = false
  let closing
  let cleanupPromise
  const trackSpy = (spy) => {
    restores.push(() => spy.mockRestore())
    return spy
  }
  const stop = () => {
    if (stopped) {
      return
    }
    stopped = true
    // close 同步使 watcher 失效；先恢复拦截并释放屏障，再等待异步收尾。
    closing = watcher.close()
    for (const restore of restores.reverse()) {
      restore()
    }
    for (const release of releases) {
      release()
    }
  }
  const cleanup = () => cleanupPromise ??= (async () => {
    stop()
    try {
      await closing
      await waitFor(() => bindings.size === 0, 'native handles closed')
      expect(watcher._pendingRecreations.size).toBe(0)
      expect(watcher._closers.size).toBe(0)
    }
    finally {
      signal.removeEventListener('abort', stop)
      await rm(dir, { recursive: true, force: true })
    }
  })()
  const bind = watcher._nodeFsHandler._watchWithNodeFs
  trackSpy(vi.spyOn(watcher._nodeFsHandler, '_watchWithNodeFs')).mockImplementation(function (file, listener) {
    listeners.set(file, listener)
    return bind.call(this, file, listener)
  })
  trackSpy(vi.spyOn(fs, 'watch')).mockImplementation((file, ...args) => {
    const relative = path.relative(dir, path.resolve(String(file)))
    const owned = relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
    if (!owned) {
      return nativeWatch(file, ...args)
    }
    beforeNativeWatch?.(String(file))
    const listener = args.at(-1)
    args[args.length - 1] = (...event) => {
      record('native-event', { file, event })
      return listener(...event)
    }
    let native
    try {
      native = nativeWatch(file, ...args)
      record('native-binding', { file })
    }
    catch (error) {
      record('native-binding-error', { file, code: error.code })
      throw error
    }
    bindings.add(native)
    native.once('close', () => bindings.delete(native))
    return native
  })
  signal.addEventListener('abort', stop, { once: true })
  const body = (async () => {
    signal.throwIfAborted()
    await mkdir(dataDir)
    await replaceSourceFile(entry, 'export default 0')
    await replaceSourceFile(data, '0')
    signal.throwIfAborted()
    task.fileWatcher.watch(entry, false)
    task.fileWatcher.watch(data, true)
    await waitFor(() => watcher._closers.has(data), 'initial subscription', signal)
    await run({
      task,
      watcher,
      data,
      dataDir,
      events,
      bindings,
      listeners,
      trackSpy,
      waitFor: async (predicate, message) => {
        try {
          await waitFor(predicate, message, signal)
        }
        catch (error) {
          record('wait-failed', { message, events })
          throw new Error(`${error.message}\n${JSON.stringify(trace, null, 2)}`, { cause: error })
        }
      },
      settle: async (pending) => {
        signal.throwIfAborted()
        let abort
        const cancelled = new Promise((resolve, reject) => {
          abort = () => reject(signal.reason)
          signal.addEventListener('abort', abort, { once: true })
        })
        try {
          const value = await Promise.race([pending, cancelled])
          signal.throwIfAborted()
          return value
        }
        finally {
          signal.removeEventListener('abort', abort)
        }
      },
      onStop: release => releases.push(release),
      beforeNativeWatch: (callback) => { beforeNativeWatch = callback },
    })
  })()
  context.onTestFinished(async () => {
    stop()
    // Vitest 超时不等待测试函数；显式等待旧函数退出，防止它跨入下一用例。
    try {
      await body
    }
    catch { /* 原测试负责报告失败；这里仍需等待并验证清理。 */ }
    await cleanup()
  })
  try {
    await body
  }
  finally {
    await cleanup()
  }
}
