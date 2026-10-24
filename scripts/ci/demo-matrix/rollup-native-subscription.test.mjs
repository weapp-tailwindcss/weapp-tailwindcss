import { mkdtemp, realpath, rm, stat } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it, vi } from 'vitest'
import { rollupTestRequire } from './rollup-test-runtime.mjs'
import { getWatchPathEntry } from './rollup-watch-paths.mjs'
import { replaceSourceFile } from './source-file.mjs'

const scenarios = ['uni-app-vite-tailwindcss-v4', 'issue-uview-plus-cssentries'].flatMap(demo =>
  ['cjs', 'esm'].flatMap(format => ['linux', 'freebsd'].map(platform => ({ demo, format, platform }))),
)

it.each(scenarios)('$demo / $format / $platform：原生更新先完成身份重绑再交给构建器', async ({ demo, format, platform }) => {
  const require = rollupTestRequire(demo)
  const dist = path.dirname(require.resolve('rollup'))
  const { Task } = format === 'cjs'
    ? require(path.join(dist, 'shared/watch.js'))
    : await import(pathToFileURL(path.join(dist, 'es/shared/watch.js')).href)
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'rollup-native-subscription-')))
  const file = path.join(root, 'value.json')
  const events = []
  let task
  let unwatch
  let add
  const platformSpy = vi.spyOn(os, 'platform').mockReturnValue(platform)
  try {
    // 只选择 Rollup 的平台分支；原生监听、原子替换和 stat 仍由本机执行。
    syncBuiltinESMExports()
    task = new Task({ invalidate: event => events.push({ ...event, id: path.normalize(event.id) }) }, {
      output: [],
      watch: { chokidar: { atomic: false, useFsEvents: false, usePolling: false } },
    })
    platformSpy.mockRestore()
    syncBuiltinESMExports()
    const watcher = task.fileWatcher.watcher
    await replaceSourceFile(file, '0')
    task.fileWatcher.watch(file, true)
    await expect.poll(() => getWatchPathEntry(watcher._closers, file), { timeout: 5000 }).toBeDefined()
    unwatch = vi.spyOn(watcher, 'unwatch')
    add = vi.spyOn(watcher, 'add')
    for (const value of [1, 2, 3]) {
      const offset = events.length
      await replaceSourceFile(file, String(value))
      await expect.poll(() => events.slice(offset), { timeout: 5000 }).toContainEqual({ id: file, event: 'update' })
      // 更新不应重启异步目录发现；那会在产物已完成后仍留下未订阅窗口。
      expect(unwatch).not.toHaveBeenCalled()
      expect(add).not.toHaveBeenCalled()
      expect(getWatchPathEntry(watcher._closers, file)).toHaveLength(1)
    }
    const deleted = events.length
    await rm(file)
    await expect.poll(() => events.slice(deleted), { timeout: 5000 }).toContainEqual({ id: file, event: 'delete' })
    const recreated = events.length
    await replaceSourceFile(file, '4')
    await expect.poll(() => events.slice(recreated), { timeout: 5000 }).toContainEqual({ id: file, event: 'create' })
  }
  finally {
    platformSpy.mockRestore()
    syncBuiltinESMExports()
    await task?.fileWatcher.watcher.close()
    unwatch?.mockRestore()
    add?.mockRestore()
    await rm(root, { recursive: true, force: true })
  }
}, 15_000)

const identities = ['uni-app-vite-tailwindcss-v4', 'issue-uview-plus-cssentries'].flatMap(demo =>
  ['cjs', 'esm'].flatMap(format => ['absolute', 'relative', 'windows-root', 'windows-drive'].map(style => ({ demo, format, style }))),
)

it.each(identities)('$demo / $format / $style：重绑始终使用注册文件身份', async ({ demo, format, style }) => {
  const require = rollupTestRequire(demo)
  const dist = path.dirname(require.resolve('rollup'))
  const { Task } = format === 'cjs'
    ? require(path.join(dist, 'shared/watch.js'))
    : await import(pathToFileURL(path.join(dist, 'es/shared/watch.js')).href)
  const task = new Task({ invalidate() {} }, { output: [], watch: { chokidar: { useFsEvents: false, usePolling: false } } })
  const watcher = task.fileWatcher.watcher
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'rollup-native-identity-')))
  const file = path.join(root, 'value.json')
  const closers = []
  let listener
  const bind = vi.spyOn(watcher._nodeFsHandler, '_watchWithNodeFs').mockImplementation((target, callback) => {
    listener = callback
    watcher._getWatchedDir(path.dirname(target)).add(path.basename(target))
    const close = vi.fn()
    closers.push(close)
    return close
  })
  watcher.removeAllListeners('change')
  try {
    await replaceSourceFile(file, '0')
    const current = await stat(file)
    // 身份变化分支不依赖宿主浮点 inode 是否恰好可区分。
    const previous = { ...current, ino: current.ino === 1 ? 2 : 1 }
    watcher._addPathCloser(file, watcher._nodeFsHandler._handleFile(file, previous, true))
    const notification = style === 'relative'
      ? path.relative(process.cwd(), file)
      : style === 'windows-root'
        ? path.win32.join(path.win32.sep, path.basename(file))
        : style === 'windows-drive'
          ? path.win32.join('C:\\', 'notifications', path.basename(file))
          : file
    await listener(notification)
    expect(bind.mock.calls.map(([target]) => target)).toEqual([file, file])
    expect(getWatchPathEntry(watcher._closers, file)).toHaveLength(1)
    expect(closers[0]).toHaveBeenCalledExactlyOnceWith()
    expect(closers[1]).not.toHaveBeenCalled()
    await watcher.close()
    expect(closers[1]).toHaveBeenCalledExactlyOnceWith()
  }
  finally {
    await watcher.close()
    bind.mockRestore()
    await rm(root, { recursive: true, force: true })
  }
})
