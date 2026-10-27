import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it, vi } from 'vitest'
import { rollupTestVariants } from './rollup-test-runtime.mjs'
import { getWatchPathEntry } from './rollup-watch-paths.mjs'
import { replaceSourceFile } from './source-file.mjs'

const cases = rollupTestVariants().flatMap(runtime => ['before-directory', 'during-read', 'after-read', 'before-child'].map(stage => ({ ...runtime, stage })))

it.each(cases)('退役目录的迟到异步发现不恢复句柄、目录索引或扫描流 ($version, $format, $stage)', async ({ require, format, stage }) => {
  const dist = path.dirname(require.resolve('rollup'))
  const { Task } = format === 'cjs'
    ? require(path.join(dist, 'shared/watch.js'))
    : await import(pathToFileURL(path.join(dist, 'es/shared/watch.js')).href)
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'rollup-directory-retirement-')))
  const directory = path.join(root, 'retired')
  const child = path.join(directory, 'child.js')
  const stable = path.join(root, 'stable.js')
  const events = []
  const task = new Task({ invalidate: event => events.push(event) }, {
    output: [],
    watch: { chokidar: { atomic: false, useFsEvents: false, usePolling: false } },
  })
  const watcher = task.fileWatcher.watcher
  const handler = watcher._nodeFsHandler
  let release
  let entered = false
  let completed
  const paused = new Promise((resolve) => {
    release = resolve
  })
  const finished = new Promise((resolve) => {
    completed = resolve
  })
  const method = stage === 'during-read' ? '_readdirp' : stage === 'before-directory' ? '_handleDir' : '_handleRead'
  const target = stage === 'during-read' ? watcher : handler
  const original = target[method].bind(target)
  const intercepted = stage === 'before-child'
    ? undefined
    : vi.spyOn(target, method).mockImplementation(stage === 'during-read'
        ? (...args) => {
            const stream = original(...args)
            if (path.resolve(args[0]) === directory) {
              stream.pause()
              entered = true
            }
            return stream
          }
        : async (...args) => {
          if (path.resolve(args[0]) !== directory) {
            return original(...args)
          }
          const result = stage === 'after-read' ? await original(...args) : undefined
          entered = true
          await paused
          return stage === 'before-directory' ? original(...args) : result
        })
  const add = handler._addToNodeFs.bind(handler)
  const tracked = vi.spyOn(handler, '_addToNodeFs').mockImplementation(async (...args) => {
    const isTarget = path.resolve(args[0]) === (stage === 'before-child' ? child : directory)
    try {
      if (stage === 'before-child' && isTarget) {
        // 由真实目录扫描进入子文件发现后再退役，旧目录的 exact ignore 不能代替子树撤销。
        entered = true
        await paused
      }
      return await add(...args)
    }
    finally {
      if (isTarget) {
        completed()
      }
    }
  })
  const belongs = (file) => {
    const relative = path.relative(directory, path.resolve(file))
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  }
  try {
    await mkdir(directory)
    await replaceSourceFile(child, '0')
    await replaceSourceFile(stable, '0')
    task.fileWatcher.watch(stable, false)
    await expect.poll(() => getWatchPathEntry(watcher._closers, stable), { timeout: 5000 }).toBeDefined()
    task.fileWatcher.watch(directory, true)
    await expect.poll(() => entered, { timeout: 5000 }).toBe(true)
    task.fileWatcher.unwatch(directory)
    release()
    await finished
    expect([...watcher._closers.keys()].some(belongs)).toBe(false)
    expect([...watcher._watched.keys()].some(belongs)).toBe(false)
    expect([...watcher._pendingRecreations.keys()].some(belongs)).toBe(false)
    expect([...watcher._streams].some(stream => belongs(stream._root))).toBe(false)
    events.length = 0
    await replaceSourceFile(child, '11')
    await replaceSourceFile(stable, 'still-active')
    await expect.poll(() => events, { timeout: 5000 }).toContainEqual({ id: stable, event: 'update' })
    expect(events.every(event => event.id === stable)).toBe(true)
    expect(task.fileWatcher.watcherGroups.size).toBeLessThanOrEqual(task.fileWatcher.fileAliases.size)
  }
  catch (error) {
    const state = {
      stage,
      ignored: [...watcher._ignoredPaths],
      closers: [...watcher._closers.keys()],
      directories: [...watcher._watched.keys()],
      groups: [...task.fileWatcher.watcherGroups].map(group => [...group.roots]),
    }
    throw new Error(`${error}\nDirectory retirement trace: ${JSON.stringify(state)}`, { cause: error })
  }
  finally {
    release()
    await task.close()
    intercepted?.mockRestore()
    tracked.mockRestore()
    await rm(root, { recursive: true, force: true })
  }
}, 15_000)
