import { EventEmitter } from 'node:events'
import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
import { runStep } from '../scripts/demo-e2e-workflow/step'

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), capture: vi.fn(), sample: vi.fn(), stop: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }))
vi.mock('../scripts/demo-e2e-workflow/process-tree', () => ({ createWorkflowProcessTree: () => ({ capture: mocks.capture, stop: mocks.stop }) }))
vi.mock('../scripts/demo-e2e-workflow/process-observer', () => ({ prepareWorkflowProcessObserver: async () => undefined }))
vi.mock('../scripts/demo-e2e-memory', async importOriginal => ({ ...await importOriginal<object>(), sampleProcessTreeAsync: mocks.sample }))

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.resetAllMocks()
})

it('慢内存采样单飞，exit 后等待末轮错误且不启动下一轮', async () => {
  vi.useFakeTimers()
  vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  const child = Object.assign(new EventEmitter(), { exitCode: null as number | null, signalCode: null })
  mocks.spawn.mockReturnValue(child)
  mocks.capture.mockResolvedValue(undefined)
  mocks.stop.mockResolvedValue(undefined)
  let reject!: (error: Error) => void
  mocks.sample.mockResolvedValueOnce(undefined).mockImplementationOnce(() => new Promise((_yes, no) => {
    reject = no
  }))
  let settled = false
  const running = runStep({ name: 'sample', command: 'test', args: [] }, 1, 1).catch(error => error).finally(() => {
    settled = true
  })
  await vi.advanceTimersByTimeAsync(0)
  await vi.advanceTimersByTimeAsync(4000)
  expect(mocks.sample).toHaveBeenCalledTimes(2)
  expect(mocks.capture).toHaveBeenCalledTimes(2)
  child.exitCode = 0
  child.emit('exit', 0)
  child.emit('close', 0)
  await vi.advanceTimersByTimeAsync(2000)
  expect(settled).toBe(false)
  expect(mocks.stop).not.toHaveBeenCalled()
  reject(new Error('memory probe timed out'))
  const error = await running
  expect(error.stepReport.error).toContain('memory probe timed out')
  expect(error.stepReport.exitCode).toBe(1)
  expect(mocks.sample).toHaveBeenCalledTimes(2)
  expect(mocks.stop).toHaveBeenCalledOnce()
})

it('正常退出等待末轮采样时仍即时响应取消，收尾保留取消与迟到拒绝', async () => {
  vi.useFakeTimers()
  vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  const child = Object.assign(new EventEmitter(), { exitCode: null as number | null, signalCode: null })
  mocks.spawn.mockReturnValue(child)
  mocks.capture.mockResolvedValue(undefined)
  mocks.stop.mockResolvedValue(undefined)
  let reject!: (error: Error) => void
  mocks.sample.mockResolvedValueOnce(undefined).mockImplementationOnce(() => new Promise((_yes, no) => {
    reject = no
  }))
  const cancellation = new AbortController()
  const running = runStep({ name: 'cancel pending sample', command: 'test', args: [] }, 1, 1, {}, {}, cancellation.signal).catch(error => error)
  await vi.advanceTimersByTimeAsync(1000)
  child.exitCode = 0
  child.emit('exit', 0)
  child.emit('close', 0)
  await vi.advanceTimersByTimeAsync(0)
  expect(mocks.stop).not.toHaveBeenCalled()
  cancellation.abort(new Error('cancel requested'))
  expect(mocks.stop).toHaveBeenCalledExactlyOnceWith(true)
  reject(new Error('late memory probe failed'))
  const error = await running
  expect(error.stepReport.exitCode).toBe(1)
  expect(error.stepReport.error).toContain('cancel requested')
  expect(error.stepReport.error).toContain('late memory probe failed')
  expect(mocks.capture).toHaveBeenCalledTimes(2)
  expect(mocks.sample).toHaveBeenCalledTimes(2)
})

it('身份采集失败时不等父 close，立即停止阶段并保留原始原因', async () => {
  vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  mocks.spawn.mockReturnValue(Object.assign(new EventEmitter(), { exitCode: null, signalCode: null }))
  mocks.capture.mockRejectedValue(new Error('identity probe failed'))
  mocks.stop.mockResolvedValue(undefined)
  const error = await runStep({ name: 'failed identity', command: 'test', args: [] }, 1, 1).catch(error => error)
  expect(error.stepReport.exitCode).toBe(1)
  expect(error.stepReport.error).toContain('identity probe failed')
  expect(mocks.stop).toHaveBeenCalledExactlyOnceWith(true)
  expect(mocks.sample).not.toHaveBeenCalled()
})
