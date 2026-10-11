import { rm } from 'node:fs/promises'
import path from 'node:path'
import { expect, it, vi } from 'vitest'
import { recoveryFixture } from './rollup-recreation-fixture.mjs'
import { replaceSourceFile } from './source-file.mjs'

it.for(['cjs', 'esm'].flatMap(format => ['EACCES', 'EMFILE'].map(code => ({ format, code }))))('恢复绑定的非缺失错误只报告一次，不进入定时重试 ($format, $code)', async ({ format, code }, context) => {
  await recoveryFixture(format, context, async ({ watcher, data, dataDir, beforeNativeWatch, settle, waitFor }) => {
    const timers = []
    const schedule = globalThis.setTimeout
    const timerSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay, ...args) => {
      const handle = schedule(callback, delay, ...args)
      if (callback.name === 'notify') {
        timers.push(handle)
      }
      return handle
    })
    const failure = Object.assign(new Error('native binding failed'), { code })
    const errors = []
    watcher.on('error', error => errors.push(error))
    const handler = watcher._nodeFsHandler
    const bind = handler._watchWithNodeFs
    const add = handler._addToNodeFs
    const finished = Promise.withResolvers()
    // 没有原生目录事件时，由实际timer触发一次恢复，避免额外事件混入次数判断。
    handler._watchWithNodeFs = function (file, ...args) {
      return path.resolve(file) === dataDir ? () => {} : bind.call(this, file, ...args)
    }
    handler._addToNodeFs = async function (...args) {
      const result = await add.apply(this, args)
      if (errors.length) {
        finished.resolve()
      }
      return result
    }
    try {
      await rm(data)
      await waitFor(() => timers.length, 'initial missing timer')
      beforeNativeWatch((file) => {
        if (path.resolve(file) === data) {
          throw failure
        }
      })
      await replaceSourceFile(data, '1')
      await settle(finished.promise)
      expect(errors).toEqual([failure])
      expect(timers.every(timer => timer._destroyed)).toBe(true)
    }
    finally {
      handler._watchWithNodeFs = bind
      handler._addToNodeFs = add
      timerSpy.mockRestore()
    }
  })
}, 15_000)

it.for(['cjs', 'esm'])('成功绑定后的同步异常不会被已消费的 pending 吞掉 (%s)', async (format, context) => {
  await recoveryFixture(format, context, async ({ watcher, data, waitFor }) => {
    const failure = new Error('file handler failed after binding')
    const errors = []
    watcher.on('error', error => errors.push(error))
    await rm(data)
    await waitFor(() => watcher._pendingRecreations.has(data), 'pending recovery')
    const handler = watcher._nodeFsHandler
    const handleFile = handler._handleFile
    const spy = vi.spyOn(handler, '_handleFile').mockImplementation(function (...args) {
      const result = handleFile.apply(this, args)
      if (path.resolve(args[0]) === data && !watcher._pendingRecreations.has(data)) {
        throw failure
      }
      return result
    })
    try {
      await replaceSourceFile(data, '1')
      await waitFor(() => errors.length, 'file handler failure forwarded')
      expect(errors).toEqual([failure])
      expect(watcher._pendingRecreations.size).toBe(0)
    }
    finally { spy.mockRestore() }
  })
}, 15_000)
