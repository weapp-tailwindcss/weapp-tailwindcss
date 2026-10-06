import { rm } from 'node:fs/promises'
import { expect, it, vi } from 'vitest'
import { fixtureReadiness, recoveryFixture } from './rollup-recreation-fixture.mjs'
import { replaceSourceFile } from './source-file.mjs'

const scenarios = ['cjs', 'esm'].flatMap(format =>
  ['recover', 'unwatch', 'close', 'abort'].flatMap(action =>
    [true, false].map(persistent => ({ format, action, persistent })),
  ),
)

it.each(scenarios)('缺失恢复释放定时器且迟到回调不复活资源 ($format, $action, $persistent)', async ({ format, action, persistent }) => {
  const controller = new AbortController()
  const ready = Promise.withResolvers()
  const release = Promise.withResolvers()
  const timers = []
  const schedule = globalThis.setTimeout
  const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay, ...args) => {
    const handle = schedule(callback, delay, ...args)
    if (callback.name === 'notify') {
      timers.push({ handle, callback })
    }
    return handle
  })
  let finish
  let resources
  const cancelled = new Error('cancel recovery fixture')
  const pending = recoveryFixture(format, {
    signal: controller.signal,
    onTestFinished(callback) { finish = callback },
  }, async (fixture) => {
    resources = fixture
    await rm(fixture.data)
    await fixture.waitFor(() => timers.some(timer => !timer.handle._destroyed), 'recovery timer scheduled')
    const live = timers.filter(timer => !timer.handle._destroyed)
    expect(live).toHaveLength(1)
    expect(live[0].handle.hasRef()).toBe(persistent)
    ready.resolve()
    await fixture.settle(release.promise)
  }, { persistent })
  const outcome = fixtureReadiness(pending, ready.promise)
  try {
    await outcome.ready
    if (action === 'abort') {
      controller.abort(cancelled)
      await finish()
    }
    else {
      if (action === 'recover') {
        await replaceSourceFile(resources.data, '1')
        await resources.waitFor(() => resources.events.some(event => event.id === resources.data && event.event === 'create'), 'recovery finished')
      }
      else if (action === 'unwatch') {
        resources.task.fileWatcher.unwatch(resources.data)
      }
      else {
        await resources.watcher.close()
      }
      expect(timers.every(timer => timer.handle._destroyed)).toBe(true)
      const add = vi.spyOn(resources.watcher._nodeFsHandler, '_addToNodeFs')
      try {
        // clearTimeout 前已派发的回调也必须遵守旧 owner 的失效状态。
        for (const timer of timers) {
          timer.callback()
        }
        await Promise.resolve()
        expect(add).not.toHaveBeenCalled()
      }
      finally { add.mockRestore() }
      release.resolve()
      expect(await outcome.finished).toEqual({ ok: true })
    }
    expect(timers.every(timer => timer.handle._destroyed)).toBe(true)
    expect(resources.watcher._pendingRecreations.size).toBe(0)
  }
  finally {
    release.resolve()
    controller.abort(cancelled)
    await finish?.()
    await outcome.finished
    spy.mockRestore()
  }
}, 15_000)
