import type { ResultPromise } from 'execa'
import type { sampleNativeProcess } from './native-command/sample'
import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { afterEach, expect, it, vi } from 'vitest'
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
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ios-sample-lifecycle-'))
  directories.push(directory)
  const output = path.join(directory, 'owned.png')
  await fs.writeFile(output, new Uint8Array(2048))
  const child = Object.assign(new EventEmitter(), { pid: 42, exitCode: null as number | null, signalCode: null as string | null })
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const completion = new Promise<void>((done, fail) => {
    resolve = done
    reject = fail
  })
  vi.mocked(execa).mockReset().mockReturnValue(Object.assign(child, { then: completion.then.bind(completion) }) as unknown as ResultPromise)
  const sample = vi.fn<typeof sampleNativeProcess>()
  const diagnostics = createIosScreenshotDiagnostics(directory, 'run-owned', {
    platform: 'darwin',
    identity: async () => ({ pid: 42, parentPid: process.pid, startedAt: 'Sun Oct 25 20:33:17 2026', executable: path.join(path.sep, 'Xcode with spaces.app', 'simctl') }),
    sample,
  })
  const read = async () => JSON.parse(await fs.readFile(path.join(directory, 'ios-screenshots.json'), 'utf8'))
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  return { output, child, resolve, reject, sample, diagnostics, read }
}

it('慢截图成功立即返回，不等待已取消的诊断；flush排空后保存迟到状态', async () => {
  const context = await fixture()
  let completeSample!: (value: { status: string }) => void
  context.sample.mockReturnValue(new Promise((resolve) => {
    completeSample = resolve
  }))
  const captured = context.diagnostics.capture(context.output, 'bound-device')
  context.child.emit('spawn')
  await vi.advanceTimersByTimeAsync(4_000)
  expect(context.sample).toHaveBeenCalledTimes(1)
  const signal = context.sample.mock.calls[0]![1]
  context.child.exitCode = 0
  context.child.emit('exit', 0, null)
  context.child.emit('close', 0, null)
  context.resolve()
  await expect(captured).resolves.toBe(context.output)
  expect(signal.aborted).toBe(true)
  let flushed = false
  const flushing = context.diagnostics.flush().then(() => {
    flushed = true
  })
  await Promise.resolve()
  expect(flushed).toBe(false)
  completeSample({ status: 'complete' })
  await flushing
  expect((await context.read()).records[0]).toMatchObject({ status: 'succeeded', sample: { status: 'canceled', result: { status: 'complete' } } })
  expect(vi.getTimerCount()).toBe(0)
})

it('截图原错与采样失败分别保留，诊断失败不覆盖或转换截图异常', async () => {
  const context = await fixture()
  context.sample.mockRejectedValue(new Error('sample permission denied'))
  const primary = new Error('screenshot bridge failed')
  const captured = context.diagnostics.capture(context.output, 'bound-device')
  const rejected = expect(captured).rejects.toBe(primary)
  context.child.emit('spawn')
  await vi.advanceTimersByTimeAsync(4_000)
  context.child.emit('exit', 1, null)
  context.child.emit('close', 1, null)
  context.reject(primary)
  await rejected
  await context.diagnostics.flush()
  expect((await context.read()).records[0]).toMatchObject({ status: 'failed', error: String(primary), sample: { status: 'failed', error: 'Error: sample permission denied' } })
  expect(vi.getTimerCount()).toBe(0)
})

it('外部取消立即转发到自有诊断，原截图错误不变且清理失败先保存再交付', async () => {
  const context = await fixture()
  let completeSample!: (value: { status: string }) => void
  context.sample.mockReturnValue(new Promise((resolve) => {
    completeSample = resolve
  }))
  const controller = new AbortController()
  const primary = new Error('original pair deadline')
  const captured = context.diagnostics.capture(context.output, 'bound-device', controller.signal)
  const rejected = expect(captured).rejects.toBe(primary)
  context.child.emit('spawn')
  await vi.advanceTimersByTimeAsync(4_000)
  controller.abort(primary)
  expect(context.sample.mock.calls[0]![1].aborted).toBe(true)
  context.child.emit('exit', null, 'SIGTERM')
  context.child.emit('close', null, 'SIGTERM')
  context.reject(primary)
  await rejected
  const flush = expect(context.diagnostics.flush()).rejects.toThrow('cleanup exceeded 5000ms')
  await vi.advanceTimersByTimeAsync(5_000)
  await flush
  expect((await context.read()).records[0]).toMatchObject({ status: 'failed', error: String(primary), sample: { status: 'cleanup-timeout' } })
  expect((await context.read()).records[0].sample.resourcesAtThreshold).toMatchObject({ parallelism: expect.any(Number), freeMemory: expect.any(Number) })
  completeSample({ status: 'complete' })
  await context.diagnostics.flush()
  expect((await context.read()).records[0].sample.status).toBe('cleanup-timeout')
  expect(vi.getTimerCount()).toBe(0)
})
