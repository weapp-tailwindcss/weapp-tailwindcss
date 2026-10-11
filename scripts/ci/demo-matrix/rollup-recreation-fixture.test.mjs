import fs from 'node:fs'
import { expect, it, vi } from 'vitest'
import { fixtureReadiness, recoveryFixture } from './rollup-recreation-fixture.mjs'
import { replaceSourceFile } from './source-file.mjs'

it.for(['cjs', 'esm'].flatMap(format => ['release', 'pending'].map(gate => ({ format, gate }))))('settles an aborted fixture before the next native watcher starts ($format, $gate)', async ({ format, gate }, context) => {
  const originalWatch = fs.watch
  const controller = new AbortController()
  const ready = Promise.withResolvers()
  const release = Promise.withResolvers()
  const timeout = new Error('simulated test timeout')
  let finish
  let resources
  let continued = false
  const aborted = recoveryFixture(format, {
    signal: controller.signal,
    onTestFinished(callback) { finish = callback },
  }, async (fixture) => {
    resources = fixture
    if (gate === 'release') {
      fixture.onStop(release.resolve)
    }
    ready.resolve()
    await fixture.settle(release.promise)
    fixture.task.fileWatcher.watch(fixture.data, true)
    continued = true
  })
  const outcome = fixtureReadiness(aborted, ready.promise)
  try {
    await outcome.ready
    controller.abort(timeout)
    await finish()
    expect(await outcome.finished).toEqual({ ok: false, error: timeout })
  }
  finally {
    controller.abort(timeout)
    await finish?.()
    await outcome.finished
  }
  expect(continued).toBe(false)
  expect(resources.watcher.closed).toBe(true)
  expect(resources.bindings.size).toBe(0)
  expect(fs.watch).toBe(originalWatch)

  await recoveryFixture(format, context, async ({ data, events, waitFor }) => {
    const nextWatch = fs.watch
    expect(vi.isMockFunction(nextWatch)).toBe(true)
    // 重复清理旧 fixture 不得恢复新 fixture 的 spy。
    await finish()
    expect(fs.watch).toBe(nextWatch)
    await replaceSourceFile(data, '22')
    await waitFor(() => events.some(event => event.id === data && event.event === 'update'), 'next fixture update')
  })
  expect(fs.watch).toBe(originalWatch)
}, 20_000)

it('fixture 初始化失败立即传播原错误，不遗留就绪等待或未处理拒绝', async () => {
  const controller = new AbortController()
  const failure = new Error('fixture initialization failed')
  controller.abort(failure)
  const run = vi.fn()
  const finish = vi.fn()
  const ready = Promise.withResolvers()
  const fixture = recoveryFixture('cjs', { signal: controller.signal, onTestFinished: finish }, run)
  const outcome = fixtureReadiness(fixture, ready.promise)
  await expect(outcome.ready).rejects.toBe(failure)
  expect(await outcome.finished).toEqual({ ok: false, error: failure })
  expect(run).not.toHaveBeenCalled()
  expect(finish).not.toHaveBeenCalled()
})
