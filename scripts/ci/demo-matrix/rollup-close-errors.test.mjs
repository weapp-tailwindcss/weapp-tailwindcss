import os from 'node:os'
import path from 'node:path'
import { setImmediate } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { expect, it, vi } from 'vitest'
import { rollupTestVariants } from './rollup-test-runtime.mjs'

async function createTask({ require, format }) {
  const dist = path.dirname(require.resolve('rollup'))
  const { Task } = format === 'cjs'
    ? require(path.join(dist, 'shared/watch.js'))
    : await import(pathToFileURL(path.join(dist, 'es/shared/watch.js')).href)
  return new Task({ invalidate() {} }, { output: [], watch: { chokidar: { useFsEvents: false } } })
}

const cases = rollupTestVariants().flatMap(runtime => ['close', 'unwatch', 'file'].map(action => ({ ...runtime, action })))

it.each(cases)('真实原生 closer 中途抛错后仍释放其余所有资源 ($version, $format, $action)', async (variant) => {
  const task = await createTask(variant)
  const watcher = task.fileWatcher.watcher
  const root = path.join(os.tmpdir(), 'rollup-native-close-error')
  const file = path.join(root, 'entry.js')
  const sibling = path.join(root, 'sibling.js')
  const failure = new Error('first native closer failed')
  const sameFile = vi.fn()
  const otherFile = vi.fn()
  const recovery = vi.fn()
  const destroy = vi.fn()
  const directory = watcher._getWatchedDir(root)
  const dispose = vi.spyOn(directory, 'dispose')
  watcher._addPathCloser(file, () => {
    throw failure
  })
  watcher._addPathCloser(file, sameFile)
  watcher._addPathCloser(sibling, otherFile)
  watcher._pendingRecreations.set(file, { closer: recovery })
  watcher._streams.add({ _root: root, destroy })
  try {
    let reported
    try {
      if (variant.action === 'close') {
        await watcher.close()
      }
      else if (variant.action === 'unwatch') {
        watcher.unwatch([file, sibling])
      }
      else { watcher._closeFile(file) }
    }
    catch (error) { reported = error }
    expect(reported).toBe(failure)
    expect(sameFile).toHaveBeenCalledOnce()
    expect(watcher._closers.has(file)).toBe(false)
    if (variant.action !== 'file') {
      expect(otherFile).toHaveBeenCalledOnce()
      expect(recovery).toHaveBeenCalledOnce()
      expect(watcher._pendingRecreations.size).toBe(0)
    }
    if (variant.action === 'close') {
      expect(destroy).toHaveBeenCalledOnce()
      expect(dispose).toHaveBeenCalledOnce()
      expect(watcher._closers.size).toBe(0)
      expect(watcher._streams.size).toBe(0)
      expect(watcher._watched.size).toBe(0)
      await expect(watcher.close()).rejects.toBe(failure)
    }
    else if (variant.action === 'unwatch') {
      expect(watcher._isIgnored(file)).toBe(true)
      expect(watcher._isIgnored(sibling)).toBe(true)
    }
  }
  finally { await task.close().catch(() => {}) }
})

it.each(rollupTestVariants())('原生关闭异步失败仍等待同组剩余释放完成 ($version, $format)', async (variant) => {
  const task = await createTask(variant)
  const watcher = task.fileWatcher.watcher
  const file = path.join(os.tmpdir(), 'rollup-async-close.js')
  const failure = new Error('async native closer failed')
  const pending = Promise.withResolvers()
  watcher._addPathCloser(file, () => Promise.reject(failure))
  watcher._addPathCloser(file, () => pending.promise)
  let finished = false
  const closing = watcher.close().catch(error => error)
  void closing.then(() => {
    finished = true
  })
  try {
    await setImmediate()
    expect(finished).toBe(false)
    pending.resolve()
    expect(await closing).toBe(failure)
    expect(watcher._closers.size).toBe(0)
  }
  finally {
    pending.resolve()
    await task.close().catch(() => {})
  }
})

it.each(rollupTestVariants())('退役子树的一个 closer 失败不留下其他句柄或扫描流 ($version, $format)', async (variant) => {
  const task = await createTask(variant)
  const fileWatcher = task.fileWatcher
  const watcher = fileWatcher.watcher
  vi.spyOn(watcher, 'add').mockReturnThis()
  const root = path.join(os.tmpdir(), 'rollup-retirement-close-error')
  const file = path.join(root, 'entry.js')
  const sibling = path.join(root, 'sibling.js')
  const stable = path.join(os.tmpdir(), 'rollup-retirement-stable.js')
  fileWatcher.watch(root, true)
  fileWatcher.watch(stable, false)
  const failure = new Error('retired child closer failed')
  const sameFile = vi.fn()
  const otherFile = vi.fn()
  const recovery = vi.fn()
  const destroy = vi.fn()
  watcher._getWatchedDir(root)
  watcher._addPathCloser(file, () => {
    throw failure
  })
  watcher._addPathCloser(file, sameFile)
  watcher._addPathCloser(sibling, otherFile)
  watcher._pendingRecreations.set(file, { closer: recovery })
  watcher._streams.add({ _root: root, destroy })
  try {
    expect(() => fileWatcher.unwatch(root)).toThrow(failure)
    expect(sameFile).toHaveBeenCalledOnce()
    expect(otherFile).toHaveBeenCalledOnce()
    expect(recovery).toHaveBeenCalledOnce()
    expect(destroy).toHaveBeenCalledOnce()
    expect(watcher._closers.size).toBe(0)
    expect(watcher._pendingRecreations.size).toBe(0)
    expect(watcher._watched.has(root)).toBe(false)
    expect(fileWatcher.fileAliases.has(stable)).toBe(true)
  }
  finally { await task.close().catch(() => {}) }
})

it.each(rollupTestVariants())('退役异步 closer 的归属保留至永久关闭完成 ($version, $format)', async (variant) => {
  const task = await createTask(variant)
  const fileWatcher = task.fileWatcher
  const watcher = fileWatcher.watcher
  vi.spyOn(watcher, 'add').mockReturnThis()
  const root = path.join(os.tmpdir(), 'rollup-retired-async')
  const file = path.join(root, 'entry.js')
  const stable = path.join(os.tmpdir(), 'rollup-retired-async-stable.js')
  const failure = new Error('retired async closer failed')
  const rejected = Promise.withResolvers()
  const pending = Promise.withResolvers()
  fileWatcher.watch(root, true)
  fileWatcher.watch(stable, false)
  watcher._addPathCloser(file, () => rejected.promise)
  watcher._addPathCloser(file, () => pending.promise)
  let finished = false
  try {
    fileWatcher.unwatch(root)
    expect(watcher._closers.has(file)).toBe(false)
    expect(fileWatcher.fileAliases.has(stable)).toBe(true)
    const closing = task.close().catch(error => error)
    void closing.then(() => {
      finished = true
    })
    rejected.reject(failure)
    await setImmediate()
    expect(finished).toBe(false)
    pending.resolve()
    expect(await closing).toBe(failure)
    expect(watcher._pendingClosures.size).toBe(0)
  }
  finally {
    rejected.resolve()
    pending.resolve()
    await task.close().catch(() => {})
  }
})

it.each(rollupTestVariants())('长期 watch 的连续异步退役失败只保留首错与总次数 ($version, $format)', async (variant) => {
  const task = await createTask(variant)
  const fileWatcher = task.fileWatcher
  const watcher = fileWatcher.watcher
  vi.spyOn(watcher, 'add').mockReturnThis()
  const root = path.join(os.tmpdir(), 'rollup-bounded-close-errors')
  const stable = path.join(root, 'stable.js')
  const files = Array.from({ length: 24 }, (_, index) => path.join(root, `retired-${index}.js`))
  const first = new Error('retired closer 0 failed')
  fileWatcher.watch(stable, false)
  // add 已替换为可控登记；目录索引同样保留稳定文件，避免触发无关缺失目录恢复。
  watcher._getWatchedDir(root).add(path.basename(stable))
  for (const file of files) {
    fileWatcher.watch(file, false)
  }
  try {
    for (const [index, file] of files.entries()) {
      const failure = index === 0 ? first : new Error(`retired closer ${index} failed`)
      watcher._addPathCloser(file, () => Promise.reject(failure))
      fileWatcher.unwatch(file)
      await Promise.all([...watcher._pendingClosures])
      expect(watcher._pendingClosures.size).toBe(0)
      expect(fileWatcher.fileAliases.has(stable)).toBe(true)
      expect(fileWatcher.watcherGroups.size).toBe(1)
    }
    expect(watcher._closeErrors).toBeUndefined()
    expect(watcher._closeFailure).toEqual({ error: first, count: files.length })
    const closing = task.close()
    expect(task.close()).toBe(closing)
    const failure = await closing.catch(error => error)
    expect(failure).toBeInstanceOf(AggregateError)
    expect(failure.errors).toEqual([first])
    expect(failure.errorCount).toBe(files.length)
    expect(failure.message).toContain(`(${files.length} errors)`)
    expect(watcher._closeFailure).toBeUndefined()
    expect(watcher._pendingClosures.size).toBe(0)
    await expect(task.close()).rejects.toBe(failure)
  }
  finally { await task.close().catch(() => {}) }
})
