import fs from 'node:fs'
import { mkdir, mkdtemp, readFile, realpath, rename, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { expect, it, vi } from 'vitest'
import { rollupTestRequire } from './rollup-test-runtime.mjs'
import { getWatchPathEntry } from './rollup-watch-paths.mjs'

const scenarios = ['uni-app-vite-tailwindcss-v4', 'issue-uview-plus-cssentries'].flatMap(demo =>
  ['cjs', 'esm'].flatMap(format => ['linux', 'freebsd'].flatMap(platform =>
    ['option', 'environment'].map(source => ({ demo, format, platform, source })))),
)

it.for(scenarios)('$demo / $format / $platform / $source：polling update 保持已采样的原生订阅', async ({ demo, format, platform, source }, context) => {
  const require = rollupTestRequire(demo)
  const dist = path.dirname(require.resolve('rollup'))
  const { Task } = format === 'cjs' ? require(path.join(dist, 'shared/watch.js')) : await import(pathToFileURL(path.join(dist, 'es/shared/watch.js')).href)
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'rollup-polling-lifecycle-')))
  const dataDir = path.join(root, 'data')
  const data = path.join(dataDir, 'value.json')
  const staged = path.join(root, 'replacement.json')
  const fixed = new Date('2000-01-01T00:00:00Z')
  const raw = []
  const events = []
  const rebindings = []
  const registrations = []
  const gate = Promise.withResolvers()
  const previousPolling = process.env.CHOKIDAR_USEPOLLING
  let task
  let watcher
  let add
  let watch
  let platformSpy
  let stopped = false
  let closing
  let cleanupPromise
  const stop = () => {
    if (stopped) {
      return
    }
    stopped = true
    // 先使归属失效，再释放可能尚在等待的新一代注册。
    try {
      closing = Promise.resolve(watcher?.close()).then(() => [], error => [error])
    }
    catch (error) {
      closing = Promise.resolve([error])
    }
    gate.resolve()
  }
  const cleanup = () => cleanupPromise ??= (async () => {
    stop()
    const errors = [...await closing]
    const settled = await Promise.allSettled(registrations)
    errors.push(...settled.filter(result => result.status === 'rejected').map(result => result.reason))
    try {
      if (add) {
        watcher._nodeFsHandler._addToNodeFs = add
      }
    }
    finally {
      try {
        watch?.mockRestore()
        platformSpy?.mockRestore()
        syncBuiltinESMExports()
        if (previousPolling === undefined) {
          delete process.env.CHOKIDAR_USEPOLLING
        }
        else {
          process.env.CHOKIDAR_USEPOLLING = previousPolling
        }
      }
      finally {
        context.signal.removeEventListener('abort', stop)
        await rm(root, { recursive: true, force: true })
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, 'polling fixture 收尾失败')
    }
  })()
  const waitFor = async (predicate, message, interval = 1) => {
    const deadline = performance.now() + 5000
    while (true) {
      context.signal.throwIfAborted()
      const matched = await predicate()
      context.signal.throwIfAborted()
      if (performance.now() >= deadline) {
        throw new Error(`${message}: 5000ms 内没有实际回执`)
      }
      if (matched) {
        return
      }
      await setTimeout(interval, undefined, { signal: context.signal })
    }
  }
  context.signal.addEventListener('abort', stop, { once: true })
  const body = (async () => {
    context.signal.throwIfAborted()
    await mkdir(dataDir)
    await writeFile(data, '{"value":0}')
    await utimes(data, fixed, new Date(fixed.getTime() - 1000))
    if (source === 'environment') {
      process.env.CHOKIDAR_USEPOLLING = '1'
    }
    else {
      delete process.env.CHOKIDAR_USEPOLLING
    }
    // 只选择 Rollup 的平台分支，原生文件与 StatWatcher 仍由当前系统实际执行。
    context.signal.throwIfAborted()
    platformSpy = vi.spyOn(os, 'platform').mockReturnValue(platform)
    syncBuiltinESMExports()
    task = new Task({ invalidate: event => events.push(event) }, {
      output: [],
      watch: { chokidar: { useFsEvents: false, usePolling: source === 'option', interval: 10 } },
    })
    platformSpy.mockRestore()
    syncBuiltinESMExports()
    watcher = task.fileWatcher.watcher
    expect(watcher.options.usePolling).toBe(true)
    watcher.on('raw', (_event, file, details) => {
      if (path.resolve(file) === data && details.curr) {
        raw.push({ curr: details.curr, prev: details.prev })
      }
    })
    task.fileWatcher.watch(data, true)
    await waitFor(() => Boolean(getWatchPathEntry(watcher._closers, data)?.length), '首次订阅')
    add = watcher._nodeFsHandler._addToNodeFs
    watcher._nodeFsHandler._addToNodeFs = function (file, ...args) {
      const pending = (async () => {
        if (path.resolve(file) === data) {
          rebindings.push(file)
          // 如果 update 关闭了旧订阅，固定新一代尚未注册的窗口，不让运行速度掩盖问题。
          await gate.promise
        }
        return add.call(this, file, ...args)
      })()
      registrations.push(pending)
      // 立即观察拒绝；最终收尾仍逐项传播，不让迟到拒绝变成未处理异常。
      void pending.catch(() => {})
      return pending
    }
    watch = vi.spyOn(fs, 'watchFile')
    let probe = fixed.getTime()
    await waitFor(async () => {
      await utimes(data, fixed, new Date(probe += 1000))
      return raw.length > 0 && events.some(event => event.event === 'update')
    }, '真实原生更新', 10)
    expect(rebindings).toEqual([])
    expect(watch.mock.calls.filter(([file]) => path.resolve(String(file)) === data)).toEqual([])
    // 恢复回执和真实替换必须来自同一连续订阅，不能用旧 raw 或登记句柄替代。
    const restoreOffset = raw.length
    await utimes(data, fixed, fixed)
    await waitFor(() => raw.slice(restoreOffset).some(({ curr }) => curr.mtimeMs === fixed.getTime()), '元数据恢复')
    await waitFor(() => !getWatchPathEntry(watcher._throttled.get('watch') ?? [], data), '原生回调退出')
    const before = await stat(data)
    await writeFile(staged, '{"value":3}')
    await utimes(staged, fixed, fixed)
    const offset = raw.length
    const eventOffset = events.length
    await rename(staged, data)
    const after = await stat(data)
    expect(after.size).toBe(before.size)
    expect(after.mtimeMs).toBe(before.mtimeMs)
    await waitFor(() => raw.slice(offset).some(({ curr, prev }) =>
      ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].every(key => curr[key] === after[key] && prev[key] === before[key])), '等长同 mtime 替换 raw')
    await waitFor(() => events.slice(eventOffset).some(event => event.id === data && event.event === 'update'), '替换 update')
    expect(await readFile(data, 'utf8')).toBe('{"value":3}')
    expect(rebindings).toEqual([])
    expect(watch.mock.calls.filter(([file]) => path.resolve(String(file)) === data)).toEqual([])
  })()
  context.onTestFinished(async () => {
    stop()
    try {
      await body
    }
    catch { /* 原测试报告失败；收尾仍等待主体退出。 */ }
    await cleanup()
  })
  try {
    await body
  }
  finally {
    await cleanup()
  }
}, 15_000)
