import { EventEmitter } from 'node:events'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runDemoE2eWorkflow } from '../scripts/demo-e2e-workflow'

const mocks = vi.hoisted(() => ({ enter: vi.fn(), spawn: vi.fn(), writeReport: vi.fn(), stop: vi.fn(), capture: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }))
vi.mock('../scripts/e2e-preflight/gate', () => ({ enterFullTestGate: mocks.enter }))
vi.mock('../scripts/demo-e2e-workflow/process-tree', () => ({ createWorkflowProcessTree: () => ({ stop: mocks.stop, capture: mocks.capture }) }))
vi.mock('../scripts/demo-e2e-memory', async importOriginal => ({
  ...await importOriginal<typeof import('../scripts/demo-e2e-memory')>(),
  sampleProcessTreeAsync: async () => undefined,
  writeDemoE2eMemoryReport: mocks.writeReport,
}))

function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

describe('阶段 close 与清理完成分别等待', () => {
  const gate = { env: {}, check: vi.fn(), close: vi.fn() }
  let child: EventEmitter
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    mocks.enter.mockResolvedValue(gate)
    mocks.writeReport.mockResolvedValue({ markdownFile: 'stop-report.md' })
    mocks.stop.mockResolvedValue(undefined)
    mocks.spawn.mockImplementation(() => {
      child = new EventEmitter()
      return child
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it.each([0, 2])('父 exit/close=%s 先到，仍等待停止失败并把阶段与 gate 错误写入最终报告', async (code) => {
    const stopping = deferred()
    mocks.stop.mockReturnValue(stopping.promise)
    gate.close.mockRejectedValue(new Error('gate finish late failed'))
    const running = runDemoE2eWorkflow(['--local', '--quality']).catch(error => error)
    await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalledOnce())
    child.emit('exit', code, null)
    child.emit('close', code, null)
    await Promise.resolve()
    expect(gate.close).not.toHaveBeenCalled()
    expect(mocks.writeReport).not.toHaveBeenCalled()
    stopping.reject(new Error('owned descendant stop late failed'))
    const error = await running
    expect(error).toBeInstanceOf(AggregateError)
    const report = mocks.writeReport.mock.calls.at(-1)?.[0].report
    expect(report.exitCode).toBe(1)
    expect(report.error).toContain('owned descendant stop late failed')
    expect(report.error).toContain('gate finish late failed')
    expect(report.steps).toHaveLength(1)
    expect(report.steps[0].exitCode).toBe(code || 1)
    expect(report.steps[0].error).toContain('owned descendant stop late failed')
    expect(mocks.spawn).toHaveBeenCalledOnce()
    expect(mocks.stop).toHaveBeenCalledOnce()
    expect(gate.close).toHaveBeenCalledOnce()
  })

  it('根进程 close 后迟到的成功清理完成前不开始下一阶段', async () => {
    const stopping = deferred()
    mocks.stop.mockReturnValueOnce(stopping.promise)
    gate.check.mockImplementation((stage: string) => {
      if (stage === 'quality all unit tests') {
        throw new Error('next stage blocked')
      }
    })
    const running = runDemoE2eWorkflow(['--local', '--quality']).catch(error => error)
    await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalledOnce())
    child.emit('exit', 0, null)
    child.emit('close', 0, null)
    await Promise.resolve()
    expect(gate.check).toHaveBeenCalledOnce()
    stopping.resolve()
    expect(String(await running)).toContain('next stage blocked')
    expect(mocks.spawn).toHaveBeenCalledOnce()
    expect(mocks.writeReport.mock.calls[0]?.[0].report.steps[0].exitCode).toBe(0)
  })
})
