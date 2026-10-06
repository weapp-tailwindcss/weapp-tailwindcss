import { rm } from 'node:fs/promises'
import path from 'node:path'
import { expect, it } from 'vitest'
import { recoveryFixture } from './rollup-recreation-fixture.mjs'
import { replaceSourceFile } from './source-file.mjs'

it.for(['cjs', 'esm'])('文件在首次缺失对账之后、原生目录订阅生效之前重建仍可恢复 (%s)', async (format, context) => {
  await recoveryFixture(format, context, async ({ watcher, data, dataDir, events, waitFor, settle }) => {
    const handler = watcher._nodeFsHandler
    const bind = handler._watchWithNodeFs
    const add = handler._addToNodeFs
    const missing = Promise.withResolvers()
    let activate
    let delayedClose
    let cancelled = false
    handler._watchWithNodeFs = function (file, listener, ...args) {
      if (path.resolve(file) !== dataDir) {
        return bind.call(this, file, listener, ...args)
      }
      // 模拟 fs.watch 已返回、底层目录事件流尚未生效；不注入文件事件。
      activate = () => {
        if (!cancelled) {
          delayedClose = bind.call(this, file, listener, ...args)
        }
      }
      return () => {
        if (cancelled) {
          return
        }
        cancelled = true
        delayedClose?.()
      }
    }
    handler._addToNodeFs = async function (file, ...args) {
      const result = await add.call(this, file, ...args)
      if (typeof result === 'string' && path.resolve(result) === data) {
        missing.resolve()
      }
      return result
    }
    try {
      await rm(data)
      await settle(missing.promise)
      expect(activate).toBeTypeOf('function')
      await replaceSourceFile(data, '1')
      await waitFor(() => events.some(event => event.id === data && event.event === 'create'), 'create after delayed native readiness')
      expect(watcher._pendingRecreations.size).toBe(0)
      expect(cancelled).toBe(true)
      activate()
      events.length = 0
      await replaceSourceFile(data, '22')
      await waitFor(() => events.some(event => event.id === data && event.event === 'update'), 'native update after recovery')
    }
    finally {
      handler._watchWithNodeFs = bind
      handler._addToNodeFs = add
    }
  })
}, 15_000)
