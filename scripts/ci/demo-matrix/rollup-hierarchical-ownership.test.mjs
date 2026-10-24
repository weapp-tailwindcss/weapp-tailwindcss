import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { it } from 'vitest'
import { rollupTestVariants } from './rollup-test-runtime.mjs'
import { getWatchPathEntry } from './rollup-watch-paths.mjs'
import { replaceSourceFile } from './source-file.mjs'

function watchers(fileWatcher) {
  return fileWatcher.watcherGroups
    ? [...fileWatcher.watcherGroups].map(group => group.watcher)
    : [fileWatcher.watcher]
}

const scenarios = rollupTestVariants().flatMap(runtime =>
  ['retain-child', 'retain-parent', 'register-child', 'register-parent'].map(action => ({ ...runtime, action })),
)

it.concurrent.for(scenarios)('父子订阅归属与历史撤销相互隔离 ($version, $format, $action)', async ({ require, format, action }, { expect }) => {
  const dist = path.dirname(require.resolve('rollup'))
  const { Task } = format === 'cjs'
    ? require(path.join(dist, 'shared/watch.js'))
    : await import(pathToFileURL(path.join(dist, 'es/shared/watch.js')).href)
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'rollup-hierarchical-ownership-')))
  const directory = path.join(root, 'data')
  const child = path.join(directory, 'retained.js')
  const sibling = path.join(directory, 'sibling.js')
  const stable = path.join(root, 'stable.js')
  // 物理路径用于订阅，原始相对 ID 必须继续用于缓存失效。
  const directoryId = path.relative(process.cwd(), directory)
  const childId = path.relative(process.cwd(), child)
  const events = []
  const task = new Task({ invalidate: event => events.push(event) }, {
    output: [],
    watch: { chokidar: { atomic: false, useFsEvents: false, usePolling: false } },
  })
  const notifications = []
  const invalidate = task.invalidate.bind(task)
  task.invalidate = (id, details) => {
    notifications.push([id, details])
    invalidate(id, details)
  }
  const ownedWatchers = new Set(watchers(task.fileWatcher))
  const graph = (parent, file) => {
    task.updateWatchedFiles({
      watchFiles: [stable, ...(file ? [childId] : [])],
      cache: { modules: [{ id: 'virtual:derived', originalCode: 'valid', transformDependencies: parent ? [directoryId] : [] }] },
    })
    for (const watcher of watchers(task.fileWatcher)) {
      ownedWatchers.add(watcher)
    }
  }
  const ready = async (file) => {
    await expect.poll(() => watchers(task.fileWatcher).some(watcher => getWatchPathEntry(watcher._closers, file)), { timeout: 5000 }).toBe(true)
  }
  const retainChild = action.endsWith('child')
  const retainedId = retainChild ? childId : directoryId
  const retiredId = retainChild ? directoryId : childId
  let retiredWatcher
  const rememberRetiringRoot = () => {
    retiredWatcher = task.fileWatcher.fileGroups?.get(path.resolve(retiredId))?.watcher ?? task.fileWatcher.watcher
  }
  const notification = async (event) => {
    await expect.poll(() => events, { timeout: 5000 }).toContainEqual({ id: retainedId, event })
    expect(notifications).toContainEqual([retainedId, { event, isTransformDependency: !retainChild }])
    expect(events.some(entry => entry.id === retiredId)).toBe(false)
    if (!retainChild) {
      expect(task.cache.modules[0].originalCode).toBe(null)
    }
    events.length = 0
    notifications.length = 0
  }
  try {
    await mkdir(directory)
    await replaceSourceFile(child, '0')
    await replaceSourceFile(sibling, '0')
    await replaceSourceFile(stable, '0')
    if (action.startsWith('retain')) {
      graph(true, true)
      await ready(child)
      await ready(directory)
      rememberRetiringRoot()
    }
    else {
      graph(retainChild, !retainChild)
      await ready(retainChild ? directory : child)
      rememberRetiringRoot()
      graph(false, false)
    }
    graph(!retainChild, retainChild)
    await ready(child)
    // 稳定根仍活跃时就释放退役子树，不能把孤立句柄留到全局关闭。
    const belongsToRetired = (file) => {
      const relative = path.relative(path.resolve(retiredId), path.resolve(file))
      return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
    }
    expect([...retiredWatcher._closers.keys()].some(belongsToRetired)).toBe(false)
    expect([...retiredWatcher._pendingRecreations.keys()].some(belongsToRetired)).toBe(false)
    events.length = 0
    notifications.length = 0
    await replaceSourceFile(child, '11')
    await notification('update')
    await rm(child)
    await notification('delete')
    await replaceSourceFile(child, '222')
    await notification('create')
    await replaceSourceFile(child, '3333')
    await notification('update')

    if (retainChild) {
      // 稳定根的正向事件作为队列屏障；退役目录中的兄弟文件不能触发构建。
      await replaceSourceFile(sibling, 'unrelated')
      await replaceSourceFile(stable, 'still-owned')
      await expect.poll(() => events, { timeout: 5000 }).toContainEqual({ id: stable, event: 'update' })
      expect(events.every(event => event.id === stable)).toBe(true)
    }
    graph(false, false)
    task.fileWatcher.unwatch(stable)
    await expect.poll(() => [...ownedWatchers].every(watcher => watcher._closers.size === 0 && watcher._pendingRecreations.size === 0), { timeout: 5000 }).toBe(true)
    expect(task.fileWatcher.fileAliases.size).toBe(0)
    expect(task.fileWatcher.transformDependencies.size).toBe(0)
    expect(task.fileWatcher.watcherGroups.size).toBe(0)
    expect(task.fileWatcher.fileGroups.size).toBe(0)
    const closing = task.close()
    expect(task.close()).toBe(closing)
    await closing
  }
  finally {
    await task.close()
    await Promise.all([...ownedWatchers].map(watcher => watcher.close()))
    await rm(root, { recursive: true, force: true })
  }
}, 20_000)
