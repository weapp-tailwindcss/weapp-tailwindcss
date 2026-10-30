import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const [dist, format] = process.argv.slice(2)
assert.ok(path.isAbsolute(dist))
assert.ok(['cjs', 'esm'].includes(format))
const require = createRequire(path.join(dist, 'rollup.js'))
// 先在真实宿主加载 native 依赖，再在独立子进程里选择 Windows 的监听分支。
if (format === 'cjs') {
  require(path.join(dist, 'rollup.js'))
}
else {
  await import(pathToFileURL(path.join(dist, 'es', 'rollup.js')).href)
}
const folder = await realpath(await mkdtemp(path.join(os.tmpdir(), 'rollup-shared-platform-')))
const file = path.join(folder, 'entry.js')
const originals = { watch: fs.watch, open: fs.open, close: fs.close, platform: os.platform }
const platform = Object.getOwnPropertyDescriptor(process, 'platform')
const handles = []
const probes = []
const closers = new Set()
const tasks = []
const errors = []
try {
  fs.watch = (target, options, callback) => {
    assert.equal(path.resolve(String(target)), file)
    const handle = new EventEmitter()
    handle.callback = callback
    handle.closeCount = 0
    handle.close = () => {
      handle.closeCount++
      return handle
    }
    handles.push(handle)
    return handle
  }
  fs.open = (...args) => probes.push(args.at(-1))
  fs.close = (descriptor, callback) => callback(null)
  os.platform = () => 'win32'
  Object.defineProperty(process, 'platform', { ...platform, value: 'win32' })
  syncBuiltinESMExports()
  const { Task } = format === 'cjs'
    ? require(path.join(dist, 'shared', 'watch.js'))
    : await import(pathToFileURL(path.join(dist, 'es', 'shared', 'watch.js')).href)
  const makeTask = (name) => {
    const task = new Task({ invalidate() {} }, { output: [], watch: { chokidar: { useFsEvents: false, usePolling: false } } })
    tasks.push(task)
    const watcher = task.fileWatcher.watcher
    watcher.on('error', error => errors.push({ name, error }))
    return watcher
  }
  const left = makeTask('left')
  const right = makeTask('right')
  const bind = (watcher, ino) => {
    const nativeClose = watcher._nodeFsHandler._watchWithNodeFs(file, () => {}, undefined, { dev: 0, ino })
    const close = () => {
      closers.delete(close)
      return nativeClose()
    }
    closers.add(close)
    return close
  }
  const closeLeft = bind(left, 1)
  const closeRight = bind(right, 1)
  assert.equal(handles.length, 1)
  handles[0].emit('error', Object.assign(new Error('old EPERM'), { code: 'EPERM' }))
  assert.equal(probes.length, 1, '必须真正进入 Windows 的异步 EPERM 探测分支')
  closeLeft()
  const closeLeft2 = bind(left, 2)
  assert.equal(handles.length, 2)
  probes.shift()(null, 42)
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(errors, [], '旧代 EPERM 探测回执不能污染已替换的共享句柄')
  handles[1].emit('error', Object.assign(new Error('current EPERM'), { code: 'EPERM' }))
  assert.equal(probes.length, 1)
  probes.shift()(null, 43)
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(errors.map(entry => entry.name), ['right', 'left'])
  closeLeft2()
  assert.equal(handles[1].closeCount, 0)
  closeRight()
  assert.deepEqual(handles.map(handle => handle.closeCount), [1, 1])
}
finally {
  for (const close of closers) {
    close()
  }
  for (const task of tasks) {
    await task.close()
  }
  fs.watch = originals.watch
  fs.open = originals.open
  fs.close = originals.close
  os.platform = originals.platform
  Object.defineProperty(process, 'platform', platform)
  syncBuiltinESMExports()
  await rm(folder, { recursive: true, force: true })
}
console.log(JSON.stringify({ passed: true }))
