import { EventEmitter } from 'node:events'
import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
import { runStep } from '../scripts/demo-e2e-workflow/step'

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), capture: vi.fn(), sample: vi.fn(), stop: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }))
vi.mock('../scripts/demo-e2e-workflow/process-tree', () => ({ createWorkflowProcessTree: () => ({ capture: mocks.capture, stop: mocks.stop }) }))
vi.mock('../scripts/demo-e2e-memory', async importOriginal => ({ ...await importOriginal<object>(), sampleProcessTreeAsync: mocks.sample }))

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.resetAllMocks()
})

it('慢内存采样单飞，exit 后等待末轮错误且不启动下一轮', async () => {
  vi.useFakeTimers()
  vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  const child = new EventEmitter()
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
  child.emit('exit', 0)
  child.emit('close', 0)
  await vi.advanceTimersByTimeAsync(2000)
  expect(settled).toBe(false)
  reject(new Error('memory probe timed out'))
  const error = await running
  expect(error.stepReport.error).toContain('memory probe timed out')
  expect(error.stepReport.exitCode).toBe(1)
  expect(mocks.sample).toHaveBeenCalledTimes(2)
  expect(mocks.stop).toHaveBeenCalledOnce()
})
