import fs from 'node:fs'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { expect, it, vi } from 'vitest'
import { recoveryFixture, recoveryFormats } from './rollup-recreation-fixture.mjs'
import { getWatchPathEntry } from './rollup-watch-paths.mjs'
import { replaceSourceFile } from './source-file.mjs'

it.for(recoveryFormats)('旧恢复 stat 不能借立即重新 watch 复活订阅 (%s)', async (format, context) => {
  await recoveryFixture(format, context, async ({ task, watcher, watcherFor, trackSpy, data, events, waitFor, settle, onStop }) => {
    const handler = watcher._nodeFsHandler
    const add = handler._addToNodeFs
    const release = Promise.withResolvers()
    const finished = Promise.withResolvers()
    onStop(release.resolve)
    let oldStatStarted = false
    const createGroup = task.fileWatcher.createWatcherGroup.bind(task.fileWatcher)
    trackSpy(vi.spyOn(task.fileWatcher, 'createWatcherGroup')).mockImplementation(() => {
      const group = createGroup()
      const handler = group.watcher._nodeFsHandler
      const add = handler._addToNodeFs
      trackSpy(vi.spyOn(handler, '_addToNodeFs')).mockImplementation(async function (file, initialAdd, ...args) {
        if (path.resolve(file) === data && initialAdd) {
          await release.promise
        }
        return add.call(this, file, initialAdd, ...args)
      })
      return group
    })
    handler._addToNodeFs = function (file, initialAdd, ...args) {
      if (path.resolve(file) !== data) {
        return add.call(this, file, initialAdd, ...args)
      }
      if (initialAdd || oldStatStarted) {
        return add.call(this, file, initialAdd, ...args)
      }
      oldStatStarted = true
      // 删除前安装拦截；由首次恢复调用重建文件，不能让在途 stat 抢先完成恢复。
      events.length = 0
      fs.writeFileSync(data, '1')
      // 先启动实际异步 stat，再于同一调用栈中取消并重新订阅。
      const pending = add.call(this, file, initialAdd, ...args)
      task.fileWatcher.unwatch(data)
      task.fileWatcher.watch(data, true)
      pending.then(finished.resolve, finished.reject)
      return pending
    }
    try {
      await rm(data)
      await waitFor(() => oldStatStarted, 'target recovery stat started')
      await settle(finished.promise)
      expect(oldStatStarted).toBe(true)
      expect(events).toEqual([])
      expect(getWatchPathEntry(watcher._closers, data)).toBeUndefined()
      expect(getWatchPathEntry(watcherFor(data)._closers, data)).toBeUndefined()
      release.resolve()
      await waitFor(() => getWatchPathEntry(watcherFor(data)._closers, data), 'new owner subscription')
      expect(getWatchPathEntry(watcher._closers, data)).toBeUndefined()
      await replaceSourceFile(data, '22')
      await waitFor(() => events.some(event => event.id === data && event.event === 'update'), 'new owner update')
    }
    finally {
      release.resolve()
      handler._addToNodeFs = add
    }
  })
}, 15_000)
