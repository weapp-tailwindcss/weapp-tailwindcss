import type { WorkflowProcessObserver } from '../../../scripts/demo-e2e-workflow/process-observer'
import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
import * as processTools from '../../../packages/hbuilderx-runner/src/process'
import * as processObserver from '../../../scripts/demo-e2e-workflow/process-observer'
import { runWithCleanup } from '../../../scripts/e2e-preflight/cleanup'
import { withLocalCommand } from './lifecycle'
import { createLocalTestScope, localCommandStartupMs, waitForLocalFixture } from './test-scope'

const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const missingMarker = () => Object.assign(new Error('marker missing'), { code: 'ENOENT' })
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  Object.defineProperty(process, 'platform', platform)
})

it('测试取消会等待正在准备的真实命令作用域收尾，禁止迟到 spawn', async () => {
  Object.defineProperty(process, 'platform', { ...platform, value: 'win32' })
  const preparing = deferred<WorkflowProcessObserver>()
  const started = deferred<void>()
  const prepare = vi.spyOn(processObserver, 'prepareWorkflowProcessObserver').mockImplementation(async () => {
    started.resolve()
    return preparing.promise
  })
  const spawn = vi.spyOn(processTools, 'spawnCommand')
  const close = vi.fn(async () => {})
  const controller = new AbortController()
  const scope = createLocalTestScope(controller.signal)
  const task = scope.run(signal => withLocalCommand({ command: 'synthetic-command', args: [], cwd: process.cwd() }, signal, vi.fn()))
  await started.promise
  const reason = new Error('test timeout')
  controller.abort(reason)
  const restoreAndRemove = vi.fn()
  const teardown = runWithCleanup(() => scope.close(), restoreAndRemove)
  await Promise.resolve()
  expect(restoreAndRemove).not.toHaveBeenCalled()
  expect(prepare).toHaveBeenCalledOnce()
  preparing.resolve({ close, table: vi.fn(), subset: vi.fn(), memory: vi.fn() })
  await expect(task).rejects.toBe(reason)
  await teardown
  expect(spawn).not.toHaveBeenCalled()
  expect(close).toHaveBeenCalledOnce()
  expect(restoreAndRemove).toHaveBeenCalledOnce()
  expect(close.mock.invocationCallOrder[0]).toBeLessThan(restoreAndRemove.mock.invocationCallOrder[0])
})

it('重复关闭复用完成结果，已接收的嵌套任务先排空，再允许删除目录与还原 mock', async () => {
  const scope = createLocalTestScope(new AbortController().signal)
  const cleanup = deferred<void>()
  const started = deferred<void>()
  let task!: Promise<void>
  await scope.run(async () => {
    task = scope.run(async (signal) => {
      started.resolve()
      await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
      await cleanup.promise
      signal.throwIfAborted()
    })
  })
  await started.promise
  const restoreAndRemove = vi.fn()
  const closed = scope.close()
  expect(scope.close()).toBe(closed)
  const teardown = runWithCleanup(() => closed, restoreAndRemove)
  await Promise.resolve()
  expect(restoreAndRemove).not.toHaveBeenCalled()
  const lateAction = vi.fn()
  await expect(scope.run(lateAction)).rejects.toBe(scope.signal.reason)
  expect(lateAction).not.toHaveBeenCalled()
  cleanup.resolve()
  await expect(task).rejects.toBe(scope.signal.reason)
  await teardown
  expect(restoreAndRemove).toHaveBeenCalledOnce()
})

it('fixture 在取消后才完成也不能继续启动后续测试动作', async () => {
  const controller = new AbortController()
  const scope = createLocalTestScope(controller.signal)
  const prepared = deferred<string>()
  const started = deferred<void>()
  const nextAction = vi.fn()
  const task = scope.run(async () => {
    started.resolve()
    return prepared.promise
  }).then(nextAction)
  const rejected = expect(task).rejects.toBeDefined()
  await started.promise
  controller.abort(new Error('fixture cancelled'))
  const closed = scope.close()
  prepared.resolve('late fixture')
  await rejected
  await closed
  expect(nextAction).not.toHaveBeenCalled()
})

it('测试超时后、afterEach 前已经结束的任务仍保留命令与清理聚合错误', async () => {
  const controller = new AbortController()
  const scope = createLocalTestScope(controller.signal)
  const started = deferred<void>()
  const cleanup = new Error('child cleanup failed')
  const task = scope.run(async (signal) => {
    started.resolve()
    await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
    throw new AggregateError([signal.reason, cleanup], 'command and cleanup failed')
  })
  await started.promise
  controller.abort(new Error('test timed out'))
  const error = await task.catch(error => error)
  await expect(scope.close()).rejects.toBe(error)
  expect(error.errors).toEqual([controller.signal.reason, cleanup])
})

it('正常断言已消费的失败不在测试结束时重复报错', async () => {
  const scope = createLocalTestScope(new AbortController().signal)
  const failure = new Error('expected failure')
  await expect(scope.run(async () => {
    throw failure
  })).rejects.toBe(failure)
  await expect(scope.close()).resolves.toBeUndefined()
})

it('嵌套进程标记等待完整启动预算，不受默认一秒轮询预算截断', async () => {
  vi.useFakeTimers()
  const command = deferred<void>()
  const start = Date.now()
  const read = vi.fn(async () => {
    if (Date.now() - start < 1500) {
      throw missingMarker()
    }
    return 1234
  })
  const marker = waitForLocalFixture(read, command.promise, new AbortController().signal)
  await vi.advanceTimersByTimeAsync(1500)
  await expect(marker).resolves.toBe(1234)
  expect(read.mock.calls.length).toBeGreaterThan(1)
  expect(vi.getTimerCount()).toBe(0)
})

it.each(['exit', 'failure', 'cancel'] as const)('标记未就绪时 %s 立即结束等待，不留下轮询计时器', async (mode) => {
  vi.useFakeTimers()
  const command = deferred<void>()
  const controller = new AbortController()
  const failure = new Error(mode)
  const marker = waitForLocalFixture(async () => {
    throw missingMarker()
  }, command.promise, controller.signal).catch(error => error)
  await vi.advanceTimersByTimeAsync(25)
  if (mode === 'exit') {
    command.resolve()
  }
  else if (mode === 'failure') {
    command.reject(failure)
  }
  else {
    controller.abort(failure)
  }
  const error = await marker
  if (mode === 'exit') {
    expect(error.message).toContain('写入标记前退出')
  }
  else {
    expect(error).toBe(failure)
  }
  expect(vi.getTimerCount()).toBe(0)
})

it('反复缺少标记不续借启动预算，迟到读取也不能通过', async () => {
  vi.useFakeTimers()
  const command = deferred<void>()
  const marker = waitForLocalFixture(async () => {
    throw missingMarker()
  }, command.promise, new AbortController().signal).catch(error => error)
  await vi.advanceTimersByTimeAsync(localCommandStartupMs)
  expect((await marker).message).toContain(`预算=${localCommandStartupMs}ms`)
  const lateRead = deferred<number>()
  const lateMarker = waitForLocalFixture(() => lateRead.promise, command.promise, new AbortController().signal).catch(error => error)
  await vi.advanceTimersByTimeAsync(localCommandStartupMs)
  lateRead.resolve(1234)
  expect((await lateMarker).message).toContain('超过截止时间')
  expect(vi.getTimerCount()).toBe(0)
})
