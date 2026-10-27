import type { ChildProcess } from 'node:child_process'
import type { sampleNativeProcess } from './native-command/sample'
import type { IosScreenshotSample } from './react-native/ios-screenshot-sample'
import { EventEmitter } from 'node:events'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createIosScreenshotSampleOwner, IOS_SCREENSHOT_SAMPLE_AFTER_MS } from './react-native/ios-screenshot-sample'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }))
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

function fixture() {
  const directory = path.join(os.tmpdir(), 'ios sample with spaces')
  const identity = vi.fn(async () => ({ pid: 42, parentPid: process.pid, startedAt: 'Sun Oct 25 20:33:17 2026', executable: path.join(path.sep, 'Xcode with spaces', 'simctl') }))
  const sample = vi.fn<typeof sampleNativeProcess>().mockResolvedValue({ status: 'complete' })
  const owner = createIosScreenshotSampleOwner(directory, { platform: 'darwin', identity, sample })
  const records: IosScreenshotSample[] = []
  const observe = (pid: number | undefined = 42) => {
    const child = Object.assign(new EventEmitter(), { pid, exitCode: null as number | null, signalCode: null as string | null })
    const stop = owner.observe(child as ChildProcess, records.length + 1, performance.now.bind(performance), value => records.push(value))
    return { child, stop }
  }
  return { directory, identity, sample, owner, records, observe }
}

it('快命令不启动诊断，清理只移除自身监听器和计时器', async () => {
  const context = fixture()
  const { child, stop } = context.observe()
  const callerListener = vi.fn()
  child.on('exit', callerListener)
  child.emit('spawn')
  await vi.advanceTimersByTimeAsync(IOS_SCREENSHOT_SAMPLE_AFTER_MS - 1)
  child.exitCode = 0
  child.emit('exit', 0, null)
  stop()
  await context.owner.drain()
  expect(context.identity).not.toHaveBeenCalled()
  expect(context.sample).not.toHaveBeenCalled()
  expect(context.records).toEqual([])
  expect(child.listeners('exit')).toEqual([callerListener])
  expect(vi.getTimerCount()).toBe(0)
})

it('一轮仅首个慢截图采一次，先核对原子进程身份再采栈和主机资源', async () => {
  const context = fixture()
  const first = context.observe()
  first.child.emit('spawn')
  await vi.advanceTimersByTimeAsync(IOS_SCREENSHOT_SAMPLE_AFTER_MS)
  expect(context.identity).toHaveBeenCalledExactlyOnceWith(42, expect.any(AbortSignal))
  expect(context.sample).toHaveBeenCalledExactlyOnceWith(42, expect.any(AbortSignal), path.join(context.directory, 'ios-screenshot-1.sample.txt'))
  expect(context.records[0]).toMatchObject({ status: 'complete', pid: 42, thresholdMs: 4000, identity: { parentPid: process.pid } })
  first.stop()
  const second = context.observe(43)
  second.child.emit('spawn')
  await vi.advanceTimersByTimeAsync(8_000)
  second.stop()
  await context.owner.drain()
  expect(context.identity).toHaveBeenCalledTimes(1)
  expect(context.sample).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})

it.each(['linux', 'win32'] as const)('%s 不执行 macOS 进程查询或采样', async (platform) => {
  const context = fixture()
  const owner = createIosScreenshotSampleOwner(context.directory, { platform, identity: context.identity, sample: context.sample })
  const child = Object.assign(new EventEmitter(), { pid: 42, exitCode: null, signalCode: null })
  const record = vi.fn()
  const stop = owner.observe(child as ChildProcess, 1, performance.now.bind(performance), record)
  child.emit('spawn')
  await vi.advanceTimersByTimeAsync(4_000)
  stop()
  await owner.drain()
  expect(record).toHaveBeenCalledWith(expect.objectContaining({ status: 'unsupported-platform' }))
  expect(context.identity).not.toHaveBeenCalled()
  expect(context.sample).not.toHaveBeenCalled()
})

it.each(['missing-spawn', 'invalid-pid', 'exited', 'closed'] as const)('拒绝未确认归属或已结束的命令：%s', async (mode) => {
  const context = fixture()
  const { child, stop } = context.observe(mode === 'invalid-pid' ? -1 : 42)
  if (mode !== 'missing-spawn') {
    child.emit('spawn')
  }
  if (mode === 'exited') {
    child.exitCode = 0
    child.emit('exit', 0, null)
  }
  if (mode === 'closed') {
    child.emit('close', 0, null)
  }
  await vi.advanceTimersByTimeAsync(4_000)
  stop()
  expect(context.identity).not.toHaveBeenCalled()
  expect(context.sample).not.toHaveBeenCalled()
})

it.each([
  { pid: 43 },
  { parentPid: process.pid + 1 },
  { executable: '/somewhere/user-process' },
  { startedAt: '' },
])('内核身份不符不能采样：%j', async (change) => {
  const context = fixture()
  context.identity.mockResolvedValue({ ...await context.identity(), ...change })
  context.identity.mockClear()
  const { child, stop } = context.observe()
  child.emit('spawn')
  await vi.advanceTimersByTimeAsync(4_000)
  stop()
  await context.owner.drain()
  expect(context.records[0]!.status).toBe('identity-rejected')
  expect(context.sample).not.toHaveBeenCalled()
})

it.each(['exit', 'close', 'cancel', 'pid-changed'] as const)('异步身份迟到时重新核所有权：%s', async (event) => {
  const context = fixture()
  const identity = await context.identity()
  const lookup = deferred<typeof identity>()
  context.identity.mockReturnValue(lookup.promise)
  const { child, stop } = context.observe()
  child.emit('spawn')
  await vi.advanceTimersByTimeAsync(4_000)
  expect(context.records[0]!.resourcesAtThreshold).toMatchObject({ parallelism: expect.any(Number), freeMemory: expect.any(Number), parentCpu: { user: expect.any(Number), system: expect.any(Number) } })
  if (event === 'cancel') {
    stop()
  }
  else if (event === 'pid-changed') {
    child.pid = 43
  }
  else {
    child.emit(event, 0, null)
  }
  lookup.resolve(identity)
  await context.owner.drain()
  stop()
  expect(context.records[0]!.status).toBe('canceled')
  expect(context.sample).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('命令结束立即取消诊断，迟到完成不能变成成功或留下监听器', async () => {
  const context = fixture()
  const sampling = deferred<{ status: string }>()
  context.sample.mockReturnValue(sampling.promise)
  const { child, stop } = context.observe()
  child.emit('spawn')
  await vi.advanceTimersByTimeAsync(4_000)
  const signal = context.sample.mock.calls[0]![1] as AbortSignal
  child.emit('exit', 0, null)
  expect(signal.aborted).toBe(true)
  sampling.resolve({ status: 'complete' })
  await context.owner.drain()
  stop()
  expect(context.records[0]!.status).toBe('canceled')
  expect(child.eventNames()).toEqual([])
  expect(vi.getTimerCount()).toBe(0)
})

it('诊断失败只记原错，排空有界且不会遗留未处理拒绝', async () => {
  const context = fixture()
  context.sample.mockRejectedValue(new Error('sample denied'))
  const { child, stop } = context.observe()
  child.emit('spawn')
  await vi.advanceTimersByTimeAsync(4_000)
  stop()
  await expect(context.owner.drain()).resolves.toBeUndefined()
  expect(context.records[0]).toMatchObject({ status: 'failed', error: 'Error: sample denied' })
  expect(vi.getTimerCount()).toBe(0)
})

it('失控诊断在既有清理预算内报错并取消，迟到结果不能覆盖清理失败', async () => {
  const context = fixture()
  const sampling = deferred<{ status: string }>()
  context.sample.mockReturnValue(sampling.promise)
  const { child, stop } = context.observe()
  child.emit('spawn')
  await vi.advanceTimersByTimeAsync(4_000)
  const draining = expect(context.owner.drain()).rejects.toThrow('cleanup exceeded 5000ms')
  await vi.advanceTimersByTimeAsync(5_000)
  await draining
  expect((context.sample.mock.calls[0]![1] as AbortSignal).aborted).toBe(true)
  expect(context.records[0]!.status).toBe('cleanup-timeout')
  sampling.resolve({ status: 'complete' })
  await context.owner.drain()
  stop()
  expect(context.records[0]!.status).toBe('cleanup-timeout')
  expect(vi.getTimerCount()).toBe(0)
})

it('身份查询超时之前同步保留主机资源，失败后不启动栈采样', async () => {
  const context = fixture()
  const identity = deferred<Awaited<ReturnType<typeof context.identity>>>()
  context.identity.mockReturnValue(identity.promise)
  const { child, stop } = context.observe()
  child.emit('spawn')
  await vi.advanceTimersByTimeAsync(4_000)
  const resources = context.records[0]!.resourcesAtThreshold
  expect(resources).toMatchObject({ at: expect.any(String), loadAverage: expect.any(Array), freeMemory: expect.any(Number), parallelism: expect.any(Number), parentCpu: expect.any(Object), parentResources: expect.any(Object) })
  identity.reject(new Error('identity query timed out'))
  await context.owner.drain()
  stop()
  expect(context.records[0]).toMatchObject({ status: 'failed', error: 'Error: identity query timed out', resourcesAtThreshold: resources })
  expect(context.sample).not.toHaveBeenCalled()
})
