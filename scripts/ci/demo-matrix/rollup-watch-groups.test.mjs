import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'
import { rollupTestVariants } from './rollup-test-runtime.mjs'

async function runtime({ require, format }) {
  const dist = path.dirname(require.resolve('rollup'))
  const file = format === 'cjs' ? path.join(dist, 'shared/watch.js') : path.join(dist, 'es/shared/watch.js')
  const exports = format === 'cjs' ? require(file) : await import(pathToFileURL(file).href)
  return { ...exports, file }
}

function taskWithoutFilesystem(Task, ignored) {
  const invalidate = vi.fn()
  const task = new Task({ invalidate }, { output: [], watch: { chokidar: { useFsEvents: false, ignored } } })
  const fileWatcher = task.fileWatcher
  // 这里固定生命周期时序，真实文件的增删与重建由相邻 ownership 回归覆盖。
  vi.spyOn(fileWatcher.watcher, 'add').mockReturnThis()
  const createGroup = fileWatcher.createWatcherGroup.bind(fileWatcher)
  vi.spyOn(fileWatcher, 'createWatcherGroup').mockImplementation(() => {
    const group = createGroup()
    vi.spyOn(group.watcher, 'add').mockReturnThis()
    return group
  })
  return { task, fileWatcher, invalidate }
}

function sourceAliases(name, entry, cwd = process.cwd(), paths = path) {
  // 这里只构造虚拟模块 ID；与 cwd 同盘才能保证相对别名不同于绝对 ID。
  const directory = paths.resolve(cwd, name)
  const file = paths.join(directory, entry)
  return { directory, file, relative: paths.relative(cwd, file) }
}

const aliasPlatforms = [
  { name: 'POSIX', paths: path.posix, cwd: '/workspace/project', temporary: '/tmp' },
  { name: 'POSIX 根目录', paths: path.posix, cwd: '/', temporary: '/tmp' },
  { name: 'Windows 同盘', paths: path.win32, cwd: 'C:\\workspace\\project', temporary: 'C:\\Temp' },
  { name: 'Windows 跨盘', paths: path.win32, cwd: 'D:\\workspace\\project', temporary: 'C:\\Temp' },
  { name: 'Windows 盘符根目录', paths: path.win32, cwd: 'D:\\', temporary: 'C:\\Temp' },
  { name: 'Windows UNC', paths: path.win32, cwd: '\\\\server\\share\\project', temporary: 'C:\\Temp' },
].flatMap(platform => ['entry.js', 'nested'].map(entry => ({ ...platform, entry })))

it.each(aliasPlatforms)('虚拟来源夹具始终提供同文件的不同绝对与相对 ID ($name, $entry)', ({ paths, cwd, temporary, entry }) => {
  const temp = vi.spyOn(os, 'tmpdir').mockReturnValue(temporary)
  try {
    const { file, relative } = sourceAliases('rollup-alias-contract', entry, cwd, paths)
    expect(paths.isAbsolute(file)).toBe(true)
    expect(paths.isAbsolute(relative)).toBe(false)
    expect(relative).not.toBe(file)
    expect(paths.resolve(cwd, relative)).toBe(file)
  }
  finally { temp.mockRestore() }
})

it.each(rollupTestVariants())('分组只通知所属原始模块 ID，保留订阅不重新安装 ($version, $format)', async (variant) => {
  const { Task } = await runtime(variant)
  const { task, fileWatcher, invalidate } = taskWithoutFilesystem(Task)
  const { directory, file: child, relative } = sourceAliases('rollup-group', 'entry.js')
  const sibling = path.join(directory, 'sibling.js')
  try {
    fileWatcher.watch(directory, true)
    fileWatcher.watch(child, false)
    fileWatcher.watch(sibling, false)
    fileWatcher.watch(relative, true)
    const groups = [...fileWatcher.watcherGroups]
    expect(groups).toHaveLength(2)
    const parent = fileWatcher.fileGroups.get(directory)
    const leaf = fileWatcher.fileGroups.get(child)
    expect(fileWatcher.fileGroups.get(sibling)).toBe(leaf)
    for (let round = 0; round < 3; round++) {
      fileWatcher.watch(directory, true)
      fileWatcher.watch(child, false)
      fileWatcher.watch(relative, true)
    }
    expect(parent.watcher.add.mock.calls).toEqual([[directory]])
    expect(leaf.watcher.add.mock.calls).toEqual([[child], [sibling]])
    for (const group of groups) {
      group.watcher.emit('change', child)
    }
    expect(invalidate.mock.calls.map(([event]) => event)).toEqual([
      { id: directory, event: 'update' },
      { id: child, event: 'update' },
      { id: relative, event: 'update' },
    ])
    invalidate.mockClear()
    fileWatcher.watch(directory, false)
    fileWatcher.unwatch(relative)
    for (const group of groups) {
      group.watcher.emit('change', child)
    }
    expect(invalidate).toHaveBeenCalledExactlyOnceWith({ id: child, event: 'update' })
    fileWatcher.unwatch(directory)
    invalidate.mockClear()
    parent.watcher.emit('change', path.join(directory, 'retired.js'))
    expect(invalidate).not.toHaveBeenCalled()
  }
  finally { await task.close() }
})

it.each(rollupTestVariants())('组数量随活跃根有界，重新分组仍遵守用户 ignored ($version, $format)', async (variant) => {
  const { Task } = await runtime(variant)
  const { task, fileWatcher } = taskWithoutFilesystem(Task, file => path.basename(file) === 'ignored.js')
  const root = path.join(os.tmpdir(), 'rollup-bounded-groups')
  const stable = path.join(root, 'stable.js')
  fileWatcher.watch(stable, false)
  try {
    for (let round = 0; round < 20; round++) {
      const directory = path.join(root, String(round))
      const child = path.join(directory, 'ignored.js')
      fileWatcher.watch(directory, true)
      fileWatcher.watch(child, false)
      expect(fileWatcher.watcherGroups.size).toBeLessThanOrEqual(fileWatcher.fileAliases.size)
      const watcher = fileWatcher.fileGroups.get(child).watcher
      expect(watcher._isIgnored(child)).toBe(true)
      const closer = vi.fn()
      watcher._addPathCloser(child, closer)
      expect(closer).toHaveBeenCalledOnce()
      expect(watcher._closers.size).toBe(0)
      fileWatcher.unwatch(directory)
      fileWatcher.unwatch(child)
      expect(fileWatcher.watcherGroups.size).toBe(1)
      expect(fileWatcher.fileAliases.size).toBe(1)
    }
    await Promise.all([...fileWatcher.pendingCloses])
    expect(fileWatcher.pendingCloses.size).toBe(0)
  }
  finally { await task.close() }
})

it.each(rollupTestVariants())('纯 transform 子目录不能抢占普通父目录的源码事件 ($version, $format)', async (variant) => {
  const { Task } = await runtime(variant)
  const { task, fileWatcher, invalidate } = taskWithoutFilesystem(Task)
  const { directory, file: nested, relative: dependency } = sourceAliases('rollup-source-and-transform', 'nested')
  const file = path.join(nested, 'entry.js')
  try {
    fileWatcher.watch(directory, false)
    fileWatcher.watch(dependency, true)
    for (const group of fileWatcher.watcherGroups) {
      group.watcher.emit('change', file)
    }
    expect(invalidate.mock.calls.map(([event]) => event)).toEqual([
      { id: file, event: 'update' },
      { id: dependency, event: 'update' },
    ])
    fileWatcher.unwatch(dependency)
    invalidate.mockClear()
    fileWatcher.fileGroups.get(directory).watcher.emit('change', file)
    expect(invalidate).toHaveBeenCalledExactlyOnceWith({ id: file, event: 'update' })
  }
  finally { await task.close() }
})

it.each(rollupTestVariants())('退役组失败由永久关闭收集，其余组仍释放且重复关闭共用结果 ($version, $format)', async (variant) => {
  const { Task } = await runtime(variant)
  const { task, fileWatcher } = taskWithoutFilesystem(Task)
  const directory = path.join(os.tmpdir(), 'rollup-retiring-group')
  const child = path.join(directory, 'entry.js')
  fileWatcher.watch(directory, true)
  fileWatcher.watch(child, false)
  const parent = fileWatcher.fileGroups.get(directory)
  const leaf = fileWatcher.fileGroups.get(child)
  const releaseParent = parent.watcher.close.bind(parent.watcher)
  const failure = new Error('retired group close failed')
  let rejectClosing
  const closing = new Promise((_resolve, reject) => {
    rejectClosing = reject
  })
  vi.spyOn(parent.watcher, 'close').mockImplementation(() => {
    void releaseParent()
    return closing
  })
  const leafClose = vi.spyOn(leaf.watcher, 'close')
  fileWatcher.unwatch(directory)
  const close = task.close()
  const outcome = close.then(() => undefined, error => error)
  expect(task.close()).toBe(close)
  expect(leafClose).toHaveBeenCalledOnce()
  let completed = false
  void outcome.then(() => {
    completed = true
  })
  await Promise.resolve()
  await Promise.resolve()
  expect(completed).toBe(false)
  fileWatcher.watch(child, true)
  expect(fileWatcher.fileAliases.size).toBe(0)
  rejectClosing(failure)
  expect(await outcome).toBe(failure)
  expect(fileWatcher.pendingCloses.size).toBe(0)
  expect(fileWatcher.watcherGroups.size).toBe(0)
  expect(fileWatcher.fileGroups.size).toBe(0)
  expect(parent.watcher.closed).toBe(true)
  expect(leaf.watcher.closed).toBe(true)
})

it.each(rollupTestVariants())('同步关闭失败不阻断其他组或上层 close hook ($version, $format)', async (variant) => {
  const { Task, Watcher } = await runtime(variant)
  const { task, fileWatcher } = taskWithoutFilesystem(Task)
  const directory = path.join(os.tmpdir(), 'rollup-close-groups')
  fileWatcher.watch(directory, true)
  fileWatcher.watch(path.join(directory, 'entry.js'), false)
  const [first, second] = [...fileWatcher.watcherGroups]
  const release = first.watcher.close.bind(first.watcher)
  const failure = new Error('active group close failed')
  vi.spyOn(first.watcher, 'close').mockImplementation(() => {
    void release()
    throw failure
  })
  const secondClose = vi.spyOn(second.watcher, 'close')
  const order = []
  let finishHook
  const hook = new Promise((resolve) => {
    finishHook = resolve
  })
  const emitter = {
    emit: vi.fn((event) => {
      if (event === 'close') {
        order.push('hook')
        return hook
      }
      return Promise.resolve()
    }),
    removeAllListeners: vi.fn(),
  }
  // 保留真实 Watcher 关闭入口；清空任务的 run 避免该用例启动编译。
  const watcher = new Watcher([], emitter)
  watcher.tasks = [{
    close() {
      order.push('task')
      return task.close()
    },
    async run() {},
  }]
  const close = watcher.close()
  const outcome = close.then(() => undefined, error => error)
  expect(watcher.close()).toBe(close)
  await Promise.resolve()
  expect(order).toEqual(['task', 'hook'])
  expect(secondClose).toHaveBeenCalledOnce()
  expect(emitter.removeAllListeners).not.toHaveBeenCalled()
  finishHook()
  expect(await outcome).toBe(failure)
  expect(emitter.removeAllListeners).toHaveBeenCalledOnce()
  expect(fileWatcher.watcherGroups.size).toBe(0)
})

it.each(rollupTestVariants())('真实补丁的目录归属支持 POSIX、盘符、UNC 与相对路径 ($version, $format)', async (variant) => {
  const { file } = await runtime(variant)
  const source = await readFile(file, 'utf8')
  const helpers = source.slice(source.indexOf('function isWatchPathWithin('), source.indexOf('async function waitForWatchClose('))
  for (const platform of [path.posix, path.win32]) {
    const { isWatchPathWithin, watchPathAncestors } = runInNewContext(`${helpers}; ({ isWatchPathWithin, watchPathAncestors })`, { path: platform, node_path: platform })
    const root = platform === path.posix ? '/workspace' : 'C:\\workspace'
    const directory = platform.resolve(root, 'project')
    const file = platform.resolve(directory, 'source', '..', 'entry.js')
    expect(isWatchPathWithin(directory, file)).toBe(true)
    expect(isWatchPathWithin(file, directory)).toBe(false)
    expect(isWatchPathWithin(directory, platform.resolve(root, 'project-other', 'entry.js'))).toBe(false)
    expect(isWatchPathWithin(directory, platform.resolve(directory, '..', 'entry.js'))).toBe(false)
    expect(Array.from(watchPathAncestors(file))).toEqual([file, directory, root, platform.parse(root).root])
    expect(isWatchPathWithin(platform.parse(root).root, file)).toBe(true)
    if (platform === path.win32) {
      expect(isWatchPathWithin('C:/workspace', 'C:\\workspace\\entry.js')).toBe(true)
      expect(isWatchPathWithin('C:\\', 'D:\\entry.js')).toBe(false)
      expect(isWatchPathWithin('\\\\server\\share', '\\\\server\\share\\entry.js')).toBe(true)
      expect(isWatchPathWithin('\\\\server\\share', '\\\\server\\other\\entry.js')).toBe(false)
    }
  }
})
