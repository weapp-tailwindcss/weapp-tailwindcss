import fs from 'node:fs'
import { expect, it, vi } from 'vitest'
import { recoveryFixture } from './rollup-recreation-fixture.mjs'
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
  // 在 abort 前安装 rejection 消费方，模拟 runner 已经接管失败结果。
  const rejection = expect(aborted).rejects.toBe(timeout)
  await ready.promise
  controller.abort(timeout)
  await finish()
  await rejection
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
