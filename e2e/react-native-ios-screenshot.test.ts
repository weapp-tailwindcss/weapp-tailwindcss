import type { ResultPromise } from 'execa'
import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { execa } from 'execa'
import { afterEach, expect, it, vi } from 'vitest'
import { runWithCleanup } from '../scripts/e2e-preflight/cleanup'
import { createNativeCaptureBudget, NATIVE_CAPTURE_TIMEOUT } from './react-native/capture-budget'
import { createIosScreenshotDiagnostics } from './react-native/ios-screenshot'

vi.mock('execa', () => ({ execa: vi.fn() }))

const directories: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  for (const directory of directories.splice(0)) {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ios-screenshot-diagnostics-'))
  directories.push(directory)
  const output = path.join(directory, 'frame-1.png')
  await fs.writeFile(output, new Uint8Array(2048))
  const diagnostics = createIosScreenshotDiagnostics(directory, 'unit-run')
  const read = async () => JSON.parse(await fs.readFile(path.join(directory, 'ios-screenshots.json'), 'utf8'))
  const streams = { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough() }
  const events = Object.assign(new EventEmitter(), { pid: 42, ...streams })
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const completion = new Promise<void>((done, fail) => {
    resolve = done
    reject = fail
  })
  const command = Object.assign(events, { then: completion.then.bind(completion) }) as unknown as ResultPromise
  vi.mocked(execa).mockReset().mockReturnValue(command)
  return { directory, output, diagnostics, read, events, streams, resolve, reject }
}

it('原命令与一次 stat 保持不变；成功路径只记内存，最终排空时才写诊断', async () => {
  const context = await fixture()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  const stat = vi.spyOn(fs, 'stat')
  const write = vi.spyOn(fs, 'writeFile')
  const controller = new AbortController()
  const captured = context.diagnostics.capture(context.output, 'bound-device', controller.signal)
  context.events.emit('spawn')
  await vi.advanceTimersByTimeAsync(120)
  context.events.emit('exit', 0, null)
  await vi.advanceTimersByTimeAsync(30)
  context.events.emit('close', 0, null)
  context.resolve()
  await expect(captured).resolves.toBe(context.output)
  expect(execa).toHaveBeenCalledExactlyOnceWith('xcrun', ['simctl', 'io', 'bound-device', 'screenshot', context.output], { cancelSignal: controller.signal, forceKillAfterDelay: 1_000 })
  expect(stat).toHaveBeenCalledExactlyOnceWith(context.output)
  expect(write).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
  await context.diagnostics.flush()
  expect(write).toHaveBeenCalledTimes(1)
  const saved = await context.read()
  expect(saved).toMatchObject({ schemaVersion: 1, runId: 'unit-run', platform: 'ios' })
  expect(saved.records).toEqual([expect.objectContaining({
    index: 1,
    output: context.output,
    device: 'bound-device',
    pid: 42,
    spawnedAtMs: 0,
    status: 'succeeded',
    exit: { atMs: 120, code: 0, signal: null },
    stdioClosed: { atMs: 150, code: 0, signal: null },
    subprocessSettled: { atMs: 150, status: 'succeeded' },
    stat: { startedAtMs: 150, settledAtMs: 150, size: 2048 },
    settledAtMs: 150,
    eventLoop: { intervalMs: 100, samples: 1, maxDelayMs: 0, meanDelayMs: 0, pendingDelayMs: 0, stopped: true },
  })])
  expect(saved.records[0].hostResources).toMatchObject({
    source: 'test-runner',
    started: { atMs: 0, durationMs: 0, resources: { freeMemory: expect.any(Number), parentCpu: { user: expect.any(Number) } } },
    settled: { atMs: 150, durationMs: 0, resources: { parallelism: expect.any(Number), parentResources: { userCPUTime: expect.any(Number) } } },
  })
  expect(saved.records[0].hostResources.cancelled).toBeUndefined()
})

it('exit 与 stdio close 单独记录，退出不冒充命令 settle 或提前执行 stat', async () => {
  const context = await fixture()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  const stat = vi.spyOn(fs, 'stat')
  const captured = context.diagnostics.capture(context.output, 'bound-device')
  context.events.emit('spawn')
  await vi.advanceTimersByTimeAsync(50)
  context.events.emit('exit', 0, null)
  await vi.advanceTimersByTimeAsync(200)
  await context.diagnostics.flush()
  const pending = (await context.read()).records[0]
  expect(pending).toMatchObject({ status: 'pending', elapsedMs: 250, exit: { atMs: 50, code: 0, signal: null } })
  expect(pending.stdioClosed).toBeUndefined()
  expect(pending.subprocessSettled).toBeUndefined()
  expect(pending.hostResources).toMatchObject({ source: 'test-runner', started: { atMs: 0 } })
  expect(pending.hostResources.cancelled).toBeUndefined()
  expect(pending.hostResources.settled).toBeUndefined()
  expect(pending.stat).toBeUndefined()
  expect(pending.streams.stdout).toMatchObject({ direction: 'output', observed: true, events: {}, exited: { atMs: 50, ended: false, closed: false } })
  expect(pending.streams.stderr).toMatchObject({ direction: 'output', observed: true, events: {}, exited: { atMs: 50, ended: false, closed: false } })
  expect(stat).not.toHaveBeenCalled()
  context.events.emit('close', 0, null)
  context.resolve()
  await captured
  await context.diagnostics.flush()
  expect((await context.read()).records[0]).toMatchObject({ status: 'succeeded', stdioClosed: { atMs: 250, code: 0, signal: null } })
  expect((await context.read()).records[0].streams.stdout.settled).toMatchObject({ atMs: 250, ended: false, closed: false })
  for (const stream of Object.values(context.streams)) {
    expect(stream.listenerCount('close')).toBe(0)
    expect(stream.listenerCount('end')).toBe(0)
    expect(stream.listenerCount('finish')).toBe(0)
    expect(stream.listenerCount('error')).toBe(0)
  }
})

it('原 10 秒预算取消后仍保留在途状态，真实命令迟到失败后才标记 settled', async () => {
  const context = await fixture()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  const stat = vi.spyOn(fs, 'stat')
  const budget = createNativeCaptureBudget(1)
  const result = budget.capture(signal => context.diagnostics.capture(context.output, 'bound-device', signal)).catch(error => error)
  context.events.emit('spawn')
  await vi.advanceTimersByTimeAsync(NATIVE_CAPTURE_TIMEOUT)
  expect(await result).toEqual(new Error('Native semantic host capture exceeded 10000ms'))
  expect(budget.pending()).toBe(true)
  await context.diagnostics.flush()
  const pending = (await context.read()).records[0]
  expect(pending).toMatchObject({ status: 'pending', cancelled: { atMs: 10000, reason: 'Error: Native semantic host capture exceeded 10000ms' } })
  expect(pending.hostResources).toMatchObject({ started: { atMs: 0 }, cancelled: { atMs: 10000, resources: { freeMemory: expect.any(Number) } } })
  expect(pending.hostResources.settled).toBeUndefined()
  expect(pending.settledAtMs).toBeUndefined()
  expect(pending.subprocessSettled).toBeUndefined()
  const failure = new Error('owned screenshot was terminated')
  await vi.advanceTimersByTimeAsync(500)
  context.events.emit('exit', null, 'SIGTERM')
  await vi.advanceTimersByTimeAsync(100)
  context.events.emit('close', null, 'SIGTERM')
  context.reject(failure)
  await expect(budget.drain()).rejects.toBe(failure)
  expect(budget.pending()).toBe(false)
  expect(stat).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
  await context.diagnostics.flush()
  expect((await context.read()).records[0]).toMatchObject({
    status: 'failed',
    exit: { atMs: 10500, code: null, signal: 'SIGTERM' },
    stdioClosed: { atMs: 10600, code: null, signal: 'SIGTERM' },
    subprocessSettled: { atMs: 10600, status: 'failed' },
    settledAtMs: 10600,
    error: String(failure),
    hostResources: { settled: { atMs: 10600, resources: { parentCpu: { user: expect.any(Number) } } } },
  })
})

it('文件 stat 失败保留原始错误，不补读文件或重复 stat', async () => {
  const context = await fixture()
  const failure = new Error('stat access denied')
  const stat = vi.spyOn(fs, 'stat').mockRejectedValue(failure)
  const read = vi.spyOn(fs, 'readFile')
  const captured = context.diagnostics.capture(context.output, 'bound-device')
  context.events.emit('spawn')
  context.events.emit('exit', 0, null)
  context.events.emit('close', 0, null)
  context.resolve()
  await expect(captured).rejects.toBe(failure)
  expect(stat).toHaveBeenCalledExactlyOnceWith(context.output)
  expect(read).not.toHaveBeenCalled()
  await context.diagnostics.flush()
  expect((await context.read()).records[0]).toMatchObject({ status: 'failed', subprocessSettled: { status: 'succeeded' }, stat: { error: String(failure) }, error: String(failure) })
})

it('小截图继续按原门槛拒绝，已成功的 stat 与失败的截图判定分别记录', async () => {
  const context = await fixture()
  await fs.writeFile(context.output, new Uint8Array(100))
  const captured = context.diagnostics.capture(context.output, 'bound-device')
  context.events.emit('spawn')
  context.events.emit('exit', 0, null)
  context.events.emit('close', 0, null)
  context.resolve()
  await expect(captured).rejects.toThrow('ios screenshot is unexpectedly small: 100')
  await context.diagnostics.flush()
  expect((await context.read()).records[0]).toMatchObject({ status: 'failed', stat: { size: 100 } })
})

it('诊断写入失败不会替换采集首错，清理组合同时交付两个原始错误', async () => {
  const context = await fixture()
  const primary = new Error('screenshot failed')
  const persistence = new Error('diagnostic disk full')
  const captured = context.diagnostics.capture(context.output, 'bound-device')
  const result = runWithCleanup(() => captured, () => context.diagnostics.flush()).catch(error => error)
  vi.spyOn(fs, 'writeFile').mockRejectedValue(persistence)
  context.events.emit('spawn')
  context.events.emit('exit', 1, null)
  context.events.emit('close', 1, null)
  context.reject(primary)
  const failure = await result
  expect(failure).toBeInstanceOf(AggregateError)
  expect(failure.errors).toEqual([primary, persistence])
  expect(failure.cause).toBe(primary)
})

it('调度延迟与命令阶段独立记录，不等待新的心跳且结束后清理计时器', async () => {
  const context = await fixture()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  let now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  const captured = context.diagnostics.capture(context.output, 'bound-device')
  context.events.emit('spawn')
  now = 350
  await vi.advanceTimersByTimeAsync(100)
  now = 470
  context.events.emit('exit', 0, null)
  context.events.emit('close', 0, null)
  context.resolve()
  await captured
  expect(vi.getTimerCount()).toBe(0)
  await context.diagnostics.flush()
  expect((await context.read()).records[0].eventLoop).toEqual({ intervalMs: 100, samples: 1, maxDelayMs: 250, meanDelayMs: 250, pendingDelayMs: 20, stopped: true })
})

it('同步启动失败没有虚构 PID/exit/close，诊断计时器仍完整清理', async () => {
  const context = await fixture()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  const failure = new Error('spawn unavailable')
  vi.mocked(execa).mockImplementation(() => {
    throw failure
  })
  await expect(context.diagnostics.capture(context.output, 'bound-device')).rejects.toBe(failure)
  expect(vi.getTimerCount()).toBe(0)
  await context.diagnostics.flush()
  const record = (await context.read()).records[0]
  expect(record).toMatchObject({ status: 'failed', error: String(failure) })
  expect(record.pid).toBeUndefined()
  expect(record.spawnedAtMs).toBeUndefined()
  expect(record.exit).toBeUndefined()
  expect(record.stdioClosed).toBeUndefined()
})
