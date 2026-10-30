import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import { mkdtemp, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { it, vi } from 'vitest'
import { rollupTestVariants } from './rollup-test-runtime.mjs'

const execFileAsync = promisify(execFile)

const cases = rollupTestVariants().flatMap(runtime =>
  ['shared-generation', 'file-listener', 'unknown-identity', 'nonpersistent', 'windows-epoch'].map(mode => ({ ...runtime, mode })),
)

it.each(cases)('$runtime / $format / $mode：共享原生句柄按代更新并保留 owner 生命周期', async ({ require, format, mode }) => {
  const dist = path.dirname(require.resolve('rollup'))
  if (mode === 'windows-epoch') {
    const { stdout } = await execFileAsync(process.execPath, [
      fileURLToPath(new URL('./rollup-shared-container-platform.fixture.mjs', import.meta.url)),
      dist,
      format,
    ])
    assert.deepEqual(JSON.parse(stdout), { passed: true })
    return
  }
  const { Task } = format === 'cjs'
    ? require(path.join(dist, 'shared/watch.js'))
    : await import(pathToFileURL(path.join(dist, 'es/shared/watch.js')).href)
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), 'rollup-shared-container-fixture-')))
  const file = path.join(dir, 'entry.js')
  const handles = []
  const failures = []
  const tasks = []
  const outstanding = new Set()
  let failNext = false
  const makeTask = (persistent = true) => {
    const task = new Task({ invalidate() {} }, { output: [], watch: { chokidar: { atomic: false, useFsEvents: false, usePolling: false, persistent } } })
    tasks.push(task)
    return task.fileWatcher.watcher
  }
  const open = (watcher, listener, identity, onError) => {
    const nativeClose = watcher._nodeFsHandler._watchWithNodeFs(file, listener, onError, identity)
    if (!nativeClose) {
      return nativeClose
    }
    const close = () => {
      outstanding.delete(close)
      return nativeClose()
    }
    outstanding.add(close)
    return close
  }
  const watchSpy = vi.spyOn(fs, 'watch').mockImplementation((target, options, callback) => {
    assert.equal(path.resolve(String(target)), file)
    if (failNext) {
      failNext = false
      throw Object.assign(new Error('binding failed'), { code: 'ENOENT' })
    }
    const handle = new EventEmitter()
    handle.callback = callback
    handle.closeCount = 0
    handle.close = () => {
      handle.closeCount++
      return handle
    }
    handles.push(handle)
    return handle
  })
  syncBuiltinESMExports()
  try {
    if (mode === 'shared-generation') {
      const left = makeTask()
      const right = makeTask()
      const third = makeTask()
      const calls = []
      const raws = []
      const errors = []
      for (const [name, watcher] of [['left', left], ['right', right], ['third', third]]) {
        watcher.on('raw', () => raws.push(name))
        watcher.on('error', error => errors.push({ name, error }))
      }
      const first = { dev: 0, ino: 11 }
      const second = { dev: 0, ino: 12 }
      const next = { dev: 1, ino: 12 }
      const closeLeft = open(left, () => calls.push('left'), first)
      const closeRight = open(right, () => calls.push('right'), first)
      assert.equal(handles.length, 1, '同代逻辑 owner 应共享一个原生句柄')
      handles[0].callback('change', path.basename(file))
      assert.deepEqual(calls, ['left', 'right'])
      assert.deepEqual(raws, ['left', 'right'])
      closeLeft()
      const closeLeft2 = open(left, () => calls.push('left'), second)
      assert.equal(handles.length, 2, 'A 重绑必须更新 B 仍共享的物理句柄')
      assert.equal(handles[0].closeCount, 1)
      calls.length = 0
      raws.length = 0
      handles[0].callback('change', path.basename(file))
      handles[0].emit('error', Object.assign(new Error('stale'), { code: 'EIO' }))
      assert.deepEqual(calls, [], '旧代原生通知不得重新广播到新代')
      assert.deepEqual(raws, [])
      assert.deepEqual(errors, [])
      closeRight()
      const closeRight2 = open(right, () => calls.push('right'), second)
      assert.equal(handles.length, 2, 'B 对同代身份重绑应复用 A 已换新的原生句柄')
      handles[1].callback('change', path.basename(file))
      assert.deepEqual(calls, ['left', 'right'])
      closeLeft2()
      closeLeft2()
      assert.equal(handles[1].closeCount, 0, '关闭 A 不得关闭 B 的当前句柄')
      calls.length = 0
      handles[1].callback('change', path.basename(file))
      assert.deepEqual(calls, ['right'])
      failNext = true
      const bindingErrors = []
      assert.equal(open(third, () => calls.push('third'), next, error => bindingErrors.push(error)), undefined)
      assert.equal(bindingErrors.length, 1)
      assert.equal(handles[1].closeCount, 0, '失败的新订阅不得破坏当前 owner')
      calls.length = 0
      handles[1].callback('change', path.basename(file))
      assert.deepEqual(calls, ['right'])
      const closeThird = open(third, () => calls.push('third'), next)
      assert.equal(handles.length, 3, '设备变化也必须切换共享物理句柄')
      assert.equal(handles[1].closeCount, 1)
      closeRight2()
      calls.length = 0
      handles[2].callback('change', path.basename(file))
      assert.deepEqual(calls, ['third'])
      handles[2].emit('error', Object.assign(new Error('current'), { code: 'EIO' }))
      assert.equal(errors.length, 1)
      assert.equal(errors[0].name, 'third')
      closeThird()
      closeThird()
      assert.deepEqual(handles.map(handle => handle.closeCount), [1, 1, 1])
    }
    else if (mode === 'file-listener') {
      await writeFile(file, 'export const value = 0')
      const left = makeTask()
      const right = makeTask()
      const initial = await stat(file)
      const previous = { ...initial, ino: initial.ino === 1 ? 2 : 1 }
      const events = []
      left.on('change', () => events.push('left'))
      right.on('change', () => events.push('right'))
      left._nodeFsHandler._handleFile(file, previous, true)
      right._nodeFsHandler._handleFile(file, previous, true)
      assert.equal(handles.length, 1)
      handles[0].callback('rename', path.basename(file))
      const deadline = performance.now() + 5000
      while (events.length < 2 && performance.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 1))
      }
      assert.deepEqual(events.sort(), ['left', 'right'])
      const expected = initial.ino > 0 ? 2 : 1
      assert.equal(handles.length, expected, '真实 _handleFile stat 分支只依据可用身份更新共享物理句柄')
      if (initial.ino > 0) {
        assert.equal(handles[0].closeCount, 1)
      }
      const current = handles.at(-1)
      await left.close()
      assert.equal(current.closeCount, 0)
      await right.close()
      assert.equal(current.closeCount, 1)
    }
    else if (mode === 'unknown-identity') {
      const left = makeTask()
      const right = makeTask()
      const closeLeft = open(left, () => {}, { dev: 0, ino: 0 })
      const closeRight = open(right, () => {}, undefined)
      assert.equal(handles.length, 1)
      closeLeft()
      const closeAgain = open(left, () => {}, { dev: 1, ino: 0 })
      assert.equal(handles.length, 1, '未知或零 inode 不能引起重复重绑')
      closeRight()
      closeAgain()
      assert.equal(handles[0].closeCount, 1)
    }
    else {
      const left = makeTask(false)
      const right = makeTask(false)
      const closeLeft = open(left, () => {}, { dev: 0, ino: 1 })
      const closeRight = open(right, () => {}, { dev: 0, ino: 1 })
      assert.equal(handles.length, 2, '非持久订阅保持独立原生句柄')
      closeLeft()
      closeRight()
      assert.deepEqual(handles.map(handle => handle.closeCount), [1, 1])
    }
  }
  catch (error) {
    failures.push(error)
  }
  finally {
    for (const close of outstanding) {
      try {
        close()
      }
      catch (error) {
        failures.push(error)
      }
    }
    for (const task of tasks) {
      await task.close().catch((error) => {
        failures.push(error)
      })
    }
    watchSpy.mockRestore()
    syncBuiltinESMExports()
    try {
      await rm(dir, { recursive: true, force: true })
    }
    catch (error) {
      failures.push(error)
    }
  }
  if (failures.length === 1) {
    throw failures[0]
  }
  if (failures.length) {
    throw new AggregateError(failures, '共享监听回归与清理失败')
  }
})
