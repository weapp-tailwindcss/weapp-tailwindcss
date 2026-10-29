import type { ChildProcess } from 'node:child_process'
import type { ProcessIdentity } from '../../../scripts/demo-e2e-workflow/process-table'
import type { WatchIdentitySource } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/process-identity'
import { EventEmitter } from 'node:events'
import process from 'node:process'
import { PassThrough } from 'node:stream'
import { afterEach, expect, it, vi } from 'vitest'
import * as cancellation from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cancellation'
import { spawnWithWatchResources } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/process-resources'
import { initializeWatchRuntime } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/process-runtime'

function fixture() {
  const identity = {
    observer: { table: vi.fn(async (): Promise<ProcessIdentity[]> => []), subset: vi.fn(async () => []) },
    beginStop: vi.fn(),
    ensureRunning: vi.fn(),
    close: vi.fn(async () => {}),
  } satisfies WatchIdentitySource
  const memory = { sample: vi.fn(), close: vi.fn(async () => {}) }
  return { identity, memory }
}
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it('慢身份准备和内存准备全部完成后才启动业务，准备结果不充当业务归属', async () => {
  const { identity, memory } = fixture()
  const order: string[] = []
  let ready!: () => void
  const preparing = new Promise<void>((resolve) => { ready = resolve })
  const spawn = vi.fn(() => { order.push('spawn'); return 'child' })
  const creating = spawnWithWatchResources('repo', spawn, async () => {
    order.push('identity-start')
    await preparing
    order.push('identity-ready')
    return identity
  }, async () => { order.push('memory-ready'); return memory })
  await Promise.resolve()
  expect(order).toEqual(['identity-start'])
  expect(spawn).not.toHaveBeenCalled()
  ready()
  const resources = await creating
  expect(order).toEqual(['identity-start', 'identity-ready', 'memory-ready', 'spawn'])
  expect(identity.ensureRunning).toHaveBeenCalledOnce()
  expect(identity.observer.table).not.toHaveBeenCalled()
  expect(identity.observer.subset).not.toHaveBeenCalled()
  expect(resources.identitySource).toBe(identity)
  await Promise.all([identity.close(), memory.close()])
})

it.each(['identity', 'memory', 'spawn', 'health', 'cancel-entry', 'cancel-ready'] as const)('启动边界 %s 失败时保留原错并回收全部已领取宿主', async (stage) => {
  const { identity, memory } = fixture()
  const primary = new Error(`failed-${stage}`)
  const checks = vi.spyOn(cancellation, 'assertWatchCommandActive')
  if (stage === 'cancel-entry') {
    checks.mockImplementation(() => { throw primary })
  }
  if (stage === 'health') {
    identity.ensureRunning.mockImplementation(() => { throw primary })
  }
  const prepareIdentity = vi.fn(async () => {
    if (stage === 'identity') { throw primary }
    return identity
  })
  const prepareMemory = vi.fn(async () => {
    if (stage === 'memory') { throw primary }
    if (stage === 'cancel-ready') {
      checks.mockImplementation(() => { throw primary })
    }
    return memory
  })
  const spawn = vi.fn(() => { throw primary })
  const error = await spawnWithWatchResources('repo', spawn, prepareIdentity, prepareMemory).catch(error => error)
  expect(error).toBe(primary)
  expect(identity.close).toHaveBeenCalledTimes(stage === 'identity' || stage === 'cancel-entry' ? 0 : 1)
  expect(memory.close).toHaveBeenCalledTimes(['spawn', 'health', 'cancel-ready'].includes(stage) ? 1 : 0)
  expect(spawn).toHaveBeenCalledTimes(stage === 'spawn' ? 1 : 0)
})

it('启动失败时不丢失两个独立宿主的回收错误', async () => {
  const { identity, memory } = fixture()
  const primary = new Error('spawn-failed')
  const memoryError = new Error('memory-close-failed')
  const identityError = new Error('identity-close-failed')
  memory.close.mockRejectedValue(memoryError)
  identity.close.mockRejectedValue(identityError)
  const error = await spawnWithWatchResources('repo', () => { throw primary }, async () => identity, async () => memory).catch(error => error)
  expect(error.errors[0].errors).toEqual([primary, memoryError])
  expect(error.errors[1]).toBe(identityError)
})

it.each(['controller', 'sampler', 'cleanup'] as const)('资源接入 %s 异常仍停止业务并关闭独立宿主', async (stage) => {
  const { identity, memory } = fixture()
  const primary = new Error('factory-failed')
  const memoryError = new Error('memory-close-failed')
  const identityError = new Error('identity-close-failed')
  const child = Object.assign(new EventEmitter(), {
    pid: 424242,
    exitCode: null,
    signalCode: null,
    kill: vi.fn(),
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
  }) as unknown as ChildProcess
  if (stage === 'cleanup') {
    memory.close.mockRejectedValue(memoryError)
    identity.close.mockRejectedValue(identityError)
  }
  const controllerFactory = vi.fn(() => { throw primary })
  const samplerFactory = vi.fn(() => { throw primary })
  const creating = initializeWatchRuntime({ child, identitySource: identity, memorySource: memory }, { onSample: vi.fn(), onUnavailable: vi.fn() }, {
    ...(stage === 'controller' ? { controller: controllerFactory } : {}),
    sampler: samplerFactory,
  }).catch(error => error)
  child.exitCode = 0
  child.emit('close', 0, null)
  const error = await creating
  if (stage === 'cleanup') {
    expect(error.errors[0]).toBe(primary)
    expect(error.errors[1].errors).toEqual([memoryError, identityError])
  }
  else { expect(error).toBe(primary) }
  expect(memory.close).toHaveBeenCalledOnce()
  expect(identity.close).toHaveBeenCalledOnce()
  expect(identity.beginStop).toHaveBeenCalledOnce()
  expect(identity.observer.table).toHaveBeenCalledOnce()
  expect(child.stdin!.destroyed).toBe(true)
  expect(child.stdout!.destroyed).toBe(true)
})

it('异步 ENOENT 没有有效 PID 时仍归还宿主且不派发进程信号', async () => {
  const { identity, memory } = fixture()
  vi.useFakeTimers()
  const child = Object.assign(new EventEmitter(), {
    pid: undefined,
    exitCode: null,
    signalCode: null,
    kill: vi.fn(),
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
  }) as unknown as ChildProcess
  const runtime = await initializeWatchRuntime({ child, identitySource: identity, memorySource: memory }, { onSample: vi.fn(), onUnavailable: vi.fn() })
  const primary = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })
  const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
  child.emit('error', primary)
  child.emit('close', -2, null)
  const stopping = runtime.controller.stop().catch(error => error)
  await vi.advanceTimersByTimeAsync(8000)
  const error = await stopping
  expect(error === primary || error.errors.includes(primary)).toBe(true)
  await runtime.memorySampler.stop()
  expect(identity.close).toHaveBeenCalledOnce()
  expect(memory.close).toHaveBeenCalledOnce()
  expect(kill).not.toHaveBeenCalled()
  expect(child.kill).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})
