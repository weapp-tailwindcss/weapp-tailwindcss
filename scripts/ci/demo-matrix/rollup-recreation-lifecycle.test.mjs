import fs from 'node:fs'
import { rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { expect, it, vi } from 'vitest'
import { recoveryFixture as fixture } from './rollup-recreation-fixture.mjs'
import { replaceSourceFile } from './source-file.mjs'

it.for(['cjs', 'esm'])('releases recovery subscriptions over repeated delete/recreate cycles (%s)', async (format, context) => {
  await fixture(format, context, async ({ waitFor, watcher, data, events, bindings }) => {
    for (const value of [1, 2, 3]) {
      events.length = 0
      await rm(data)
      await waitFor(() => events.some(x => x.id === data && x.event === 'delete'), `cycle ${value}: delete`)
      await replaceSourceFile(data, String(value))
      await waitFor(() => events.some(x => x.id === data && x.event === 'create'), 'create')
      expect(watcher._pendingRecreations.size).toBe(0)
      expect(watcher._closers.get(data)).toHaveLength(1)
      await waitFor(() => bindings.size === 2, `cycle ${value}: release recovery handle`)
    }
  })
}, 20_000)

it.for(['cjs', 'esm'])('does not rebind from a file stat completed after unwatch (%s)', async (format, context) => {
  await fixture(format, context, async ({ task, watcher, data, events, listeners }) => {
    // 同步替换后立即进入真实异步 stat，在它返回前取消订阅。
    const replacement = path.join(path.dirname(data), 'replacement.json')
    fs.writeFileSync(replacement, '1')
    fs.renameSync(replacement, data)
    const pending = listeners.get(data)(data)
    task.fileWatcher.unwatch(data)
    await pending
    expect(events).toEqual([])
    expect(watcher._closers.has(data)).toBe(false)
    expect(watcher._pendingRecreations.size).toBe(0)
  })
}, 20_000)

it.for(['cjs', 'esm'])('keeps one directory subscription when subsequent builds retain the dependency (%s)', async (format, context) => {
  await fixture(format, context, async ({ settle, trackSpy, task, watcher, dataDir }) => {
    const handler = watcher._nodeFsHandler
    const add = handler._addToNodeFs
    const registrations = []
    const spy = trackSpy(vi.spyOn(handler, '_addToNodeFs')).mockImplementation(function (...args) {
      const result = add.apply(this, args)
      registrations.push(result)
      return result
    })
    try {
      for (let build = 0; build < 4; build++) {
        task.fileWatcher.watch(dataDir, true)
        await settle(Promise.all(registrations))
      }
      expect(watcher._closers.get(dataDir)).toHaveLength(1)
    }
    finally { spy.mockRestore() }
  })
}, 20_000)

it.for(['cjs', 'esm'].flatMap(format => ['unwatch', 'close'].map(action => ({ format, action }))))('cancels a paused recovery without installing late handles ($format, $action)', async ({ format, action }, context) => {
  await fixture(format, context, async ({ settle, waitFor, trackSpy, onStop, task, watcher, data, dataDir, events }) => {
    const release = Promise.withResolvers()
    onStop(release.resolve)
    const finished = Promise.withResolvers()
    const handler = watcher._nodeFsHandler
    const add = handler._addToNodeFs
    let blocked = false
    const spy = trackSpy(vi.spyOn(handler, '_addToNodeFs')).mockImplementation(async function (file, ...args) {
      const pause = file === dataDir && args[3] === path.basename(data)
      if (pause) {
        blocked = true
        await release.promise
      }
      try {
        return await add.call(this, file, ...args)
      }
      finally {
        if (pause) {
          finished.resolve()
        }
      }
    })
    try {
      await rm(data)
      await waitFor(() => blocked, 'paused recovery')
      if (action === 'close') {
        await watcher.close()
      }
      else { task.fileWatcher.unwatch(data) }
      events.length = 0
      await replaceSourceFile(data, '1')
      release.resolve()
      await settle(finished.promise)
      expect(events).toEqual([])
      expect(watcher._pendingRecreations.size).toBe(0)
      expect(watcher._closers.has(data)).toBe(false)
      if (action === 'unwatch') {
        task.fileWatcher.watch(data, true)
        await waitFor(() => watcher._closers.has(data), 'file subscription')
        await replaceSourceFile(data, '22')
        await waitFor(() => events.some(x => x.id === data && x.event === 'update'), 'update')
      }
    }
    finally {
      release.resolve()
      spy.mockRestore()
    }
  })
}, 20_000)

it.for(['cjs', 'esm'].flatMap(format => ['add', 'change'].map(event => ({ format, event }))))('allows synchronous cancellation from a real file event ($format, $event)', async ({ format, event }, context) => {
  await fixture(format, context, async ({ waitFor, task, watcher, data, bindings }) => {
    let cancelled = false
    watcher.on(event, (file) => {
      if (file === data) {
        if (event === 'add') {
          task.fileWatcher.unwatch(data)
        }
        else {
          void watcher.close()
        }
        cancelled = true
      }
    })
    if (event === 'add') {
      await rm(data)
      await waitFor(() => watcher._pendingRecreations.has(data), 'recovery subscription')
    }
    await replaceSourceFile(data, '1')
    await waitFor(() => cancelled, 'synchronous cancellation')
    await waitFor(() => bindings.size === (event === 'add' ? 1 : 0), 'cancelled handles')
    expect(watcher._closers.has(data)).toBe(false)
    expect(watcher._pendingRecreations.size).toBe(0)
  })
}, 20_000)

it.for(['cjs', 'esm'])('keeps recovery live when the file disappears between stat and native binding (%s)', async (format, context) => {
  await fixture(format, context, async ({ waitFor, trackSpy, watcher, data, dataDir, events }) => {
    await rm(data)
    await waitFor(() => typeof watcher._pendingRecreations.get(data)?.closer === 'function', 'recovery handle')
    // 真正删除 stat 对应的文件；禁用异步对账只用于固定这一个注册窗口。
    const handler = watcher._nodeFsHandler
    const add = trackSpy(vi.spyOn(handler, '_addToNodeFs')).mockResolvedValue(false)
    try {
      await replaceSourceFile(data, '1')
      const stale = await stat(data)
      await rm(data)
      events.length = 0
      handler._handleFile(data, stale, true)
      expect(events).toEqual([])
      expect(watcher._getWatchedDir(dataDir).has(path.basename(data))).toBe(false)
      expect(watcher._pendingRecreations.get(data)?.closer).toBeTypeOf('function')
    }
    finally { add.mockRestore() }
    await replaceSourceFile(data, '2')
    await waitFor(() => events.some(x => x.id === data && x.event === 'create'), 'create')
  })
}, 20_000)
