import fs from 'node:fs'
import { mkdir, mkdtemp, realpath, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it, vi } from 'vitest'
import { rollupTestRequire } from './rollup-test-runtime.mjs'
import { replaceSourceFile } from './source-file.mjs'

const require = rollupTestRequire('taro-vite-react-tailwindcss-v4')
const dist = path.dirname(require.resolve('rollup'))

async function fixture(format, run) {
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
  const bind = watcher._nodeFsHandler._watchWithNodeFs
  const bindSpy = vi.spyOn(watcher._nodeFsHandler, '_watchWithNodeFs').mockImplementation(function (file, listener) {
    listeners.set(file, listener)
    return bind.call(this, file, listener)
  })
  const bindings = new Set()
  const watch = fs.watch
  const spy = vi.spyOn(fs, 'watch').mockImplementation((file, ...args) => {
    const native = watch(file, ...args)
    const relative = path.relative(dir, path.resolve(String(file)))
    if (relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
      bindings.add(native)
      native.once('close', () => bindings.delete(native))
    }
    return native
  })
  try {
    await mkdir(dataDir)
    await replaceSourceFile(entry, 'export default 0')
    await replaceSourceFile(data, '0')
    task.fileWatcher.watch(entry, false)
    task.fileWatcher.watch(data, true)
    await expect.poll(() => watcher._closers.has(data), { timeout: 5000 }).toBe(true)
    await run({ task, watcher, data, dataDir, events, bindings, listeners })
  }
  finally {
    try {
      await watcher.close()
      await expect.poll(() => bindings.size, { timeout: 5000 }).toBe(0)
      expect(watcher._pendingRecreations.size).toBe(0)
      expect(watcher._closers.size).toBe(0)
    }
    finally {
      spy.mockRestore()
      bindSpy.mockRestore()
      await rm(dir, { recursive: true, force: true })
    }
  }
}

it.each(['cjs', 'esm'])('releases recovery subscriptions over repeated delete/recreate cycles (%s)', async (format) => {
  await fixture(format, async ({ watcher, data, events, bindings }) => {
    for (const value of [1, 2, 3]) {
      events.length = 0
      await rm(data)
      await expect.poll(() => events.some(x => x.id === data && x.event === 'delete'), { timeout: 5000 }).toBe(true)
      await replaceSourceFile(data, String(value))
      await expect.poll(() => events.some(x => x.id === data && x.event === 'create'), { timeout: 5000 }).toBe(true)
      expect(watcher._pendingRecreations.size).toBe(0)
      expect(watcher._closers.get(data)).toHaveLength(1)
      await expect.poll(() => bindings.size, { timeout: 5000 }).toBe(2)
    }
  })
})

it.each(['cjs', 'esm'])('does not rebind from a file stat completed after unwatch (%s)', async (format) => {
  await fixture(format, async ({ task, watcher, data, events, listeners }) => {
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
})

it.each(['cjs', 'esm'])('keeps one directory subscription when subsequent builds retain the dependency (%s)', async (format) => {
  await fixture(format, async ({ task, watcher, dataDir }) => {
    const handler = watcher._nodeFsHandler
    const add = handler._addToNodeFs
    const registrations = []
    const spy = vi.spyOn(handler, '_addToNodeFs').mockImplementation(function (...args) {
      const result = add.apply(this, args)
      registrations.push(result)
      return result
    })
    try {
      for (let build = 0; build < 4; build++) {
        task.fileWatcher.watch(dataDir, true)
        await Promise.all(registrations)
      }
      expect(watcher._closers.get(dataDir)).toHaveLength(1)
    }
    finally { spy.mockRestore() }
  })
})

it.each(['cjs', 'esm'].flatMap(format => ['unwatch', 'close'].map(action => ({ format, action }))))('cancels a paused recovery without installing late handles ($format, $action)', async ({ format, action }) => {
  await fixture(format, async ({ task, watcher, data, dataDir, events }) => {
    const release = Promise.withResolvers()
    const finished = Promise.withResolvers()
    const handler = watcher._nodeFsHandler
    const add = handler._addToNodeFs
    let blocked = false
    const spy = vi.spyOn(handler, '_addToNodeFs').mockImplementation(async function (file, ...args) {
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
      await expect.poll(() => blocked, { timeout: 5000 }).toBe(true)
      if (action === 'close') {
        await watcher.close()
      }
      else { task.fileWatcher.unwatch(data) }
      events.length = 0
      await replaceSourceFile(data, '1')
      release.resolve()
      await finished.promise
      expect(events).toEqual([])
      expect(watcher._pendingRecreations.size).toBe(0)
      expect(watcher._closers.has(data)).toBe(false)
      if (action === 'unwatch') {
        task.fileWatcher.watch(data, true)
        await expect.poll(() => watcher._closers.has(data), { timeout: 5000 }).toBe(true)
        await replaceSourceFile(data, '22')
        await expect.poll(() => events.some(x => x.id === data && x.event === 'update'), { timeout: 5000 }).toBe(true)
      }
    }
    finally {
      release.resolve()
      spy.mockRestore()
    }
  })
})

it.each(['cjs', 'esm'].flatMap(format => ['add', 'change'].map(event => ({ format, event }))))('allows synchronous cancellation from a real file event ($format, $event)', async ({ format, event }) => {
  await fixture(format, async ({ task, watcher, data, bindings }) => {
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
      await expect.poll(() => watcher._pendingRecreations.has(data), { timeout: 5000 }).toBe(true)
    }
    await replaceSourceFile(data, '1')
    await expect.poll(() => cancelled, { timeout: 5000 }).toBe(true)
    await expect.poll(() => bindings.size, { timeout: 5000 }).toBe(event === 'add' ? 1 : 0)
    expect(watcher._closers.has(data)).toBe(false)
    expect(watcher._pendingRecreations.size).toBe(0)
  })
})

it.each(['cjs', 'esm'])('keeps recovery live when the file disappears between stat and native binding (%s)', async (format) => {
  await fixture(format, async ({ watcher, data, dataDir, events }) => {
    await rm(data)
    await expect.poll(() => watcher._pendingRecreations.get(data)?.closer, { timeout: 5000 }).toBeTypeOf('function')
    // 真正删除 stat 对应的文件；禁用异步对账只用于固定这一个注册窗口。
    const handler = watcher._nodeFsHandler
    const add = vi.spyOn(handler, '_addToNodeFs').mockResolvedValue(false)
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
    await expect.poll(() => events.some(x => x.id === data && x.event === 'create'), { timeout: 5000 }).toBe(true)
  })
})
