import { mkdtemp, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it, vi } from 'vitest'
import { rollupTestRequire } from './rollup-test-runtime.mjs'

const scenarios = ['uni-app-vite-tailwindcss-v4', 'issue-uview-plus-cssentries', 'taro-vite-react-tailwindcss-v4'].flatMap(demo =>
  ['cjs', 'esm'].flatMap(format => ['delete', 'unwatch', 'close', 'inflight-close'].map(operation => ({ demo, format, operation }))),
)

it.each(scenarios)('$demo / $format / $operation：原生事件节流保留真实删除并服从订阅归属', async ({ demo, format, operation }) => {
  const require = rollupTestRequire(demo)
  const dist = path.dirname(require.resolve('rollup'))
  const { Task } = format === 'cjs'
    ? require(path.join(dist, 'shared/watch.js'))
    : await import(pathToFileURL(path.join(dist, 'es/shared/watch.js')).href)
  const task = new Task({ invalidate() {} }, {
    output: [],
    watch: { chokidar: { atomic: false, useFsEvents: false, usePolling: false } },
  })
  const watcher = task.fileWatcher.watcher
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'rollup-native-delete-')))
  const file = path.join(root, 'value.json')
  const events = []
  let listener
  const bind = vi.spyOn(watcher._nodeFsHandler, '_watchWithNodeFs').mockImplementation((target, callback) => {
    if (path.resolve(target) === file) {
      listener = callback
    }
    watcher._getWatchedDir(path.dirname(target)).add(path.basename(target))
    return () => {}
  })
  // 这里只控制原生通知的时序，文件状态仍由真实磁盘与 Chokidar 的 stat/remove 判断。
  watcher.removeAllListeners('change')
  watcher.removeAllListeners('unlink')
  // Chokidar 的事件 ID 使用逻辑路径；在本测试的文件系统比较边界转回平台路径。
  watcher.on('change', id => events.push({ event: 'update', id: path.normalize(id) }))
  watcher.on('unlink', id => events.push({ event: 'delete', id: path.normalize(id) }))
  try {
    await writeFile(file, '0')
    const initial = await stat(file)
    const closer = watcher._nodeFsHandler._handleFile(file, initial, true)
    watcher._getWatchedDir(root).add(path.basename(file))
    watcher._addPathCloser(file, closer)
    vi.useFakeTimers()
    await writeFile(file, '111')
    await listener(file, await stat(file))
    expect(events).toEqual([{ event: 'update', id: file }])
    await rm(file)
    if (operation === 'inflight-close') {
      watcher._throttled.get('watch').get(file).clear()
      const pending = listener(file)
      // stat 已发出但尚未返回；关闭后 ENOENT 不能重新创建目录或文件归属。
      await watcher.close()
      await pending
      expect(events).toEqual([{ event: 'update', id: file }])
      expect(watcher._watched.size).toBe(0)
      expect(watcher._closers.size).toBe(0)
      return
    }
    await listener(file)
    await listener(file)
    expect(events).toHaveLength(1)
    if (operation !== 'delete') {
      const previousListener = listener
      const timers = vi.getTimerCount()
      if (operation === 'unwatch') {
        watcher.unwatch(file)
      }
      else {
        await watcher.close()
      }
      expect(vi.getTimerCount()).toBeLessThan(timers)
      await vi.advanceTimersByTimeAsync(5)
      vi.useRealTimers()
      await previousListener(file)
      expect(events).toEqual([{ event: 'update', id: file }])
      expect(bind).toHaveBeenCalledTimes(1)
      expect(watcher._closers.size).toBe(0)
      if (operation === 'close') {
        return
      }
      // 同路径新订阅必须从自己的状态开始；旧回调不能把新文件报告为删除。
      await writeFile(file, '22')
      watcher.add(file)
      await expect.poll(() => listener, { timeout: 1000 }).not.toBe(previousListener)
      await previousListener(file)
      await writeFile(file, '333')
      await listener(file, await stat(file))
      expect(events).toEqual([{ event: 'update', id: file }, { event: 'update', id: file }])
      return
    }
    await vi.advanceTimersByTimeAsync(5)
    vi.useRealTimers()
    await expect.poll(() => events, { timeout: 1000 }).toContainEqual({ event: 'delete', id: file })
    expect(events.filter(item => item.event === 'delete')).toHaveLength(1)
  }
  finally {
    vi.useRealTimers()
    await watcher.close()
    bind.mockRestore()
    await rm(root, { recursive: true, force: true })
  }
})
