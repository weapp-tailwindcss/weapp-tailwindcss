import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
import * as table from '../scripts/demo-e2e-workflow/process-table'
import { createWorkflowProcessTree } from '../scripts/demo-e2e-workflow/process-tree'

const platform = process.platform
afterEach(() => {
  Object.defineProperty(process, 'platform', { value: platform })
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it.each(['linux', 'win32'])('%s 外层剩余 2ms 到实际扫描只剩 1ms 时不新建探针，保留原超时', async (target) => {
  Object.defineProperty(process, 'platform', { value: target })
  vi.useFakeTimers()
  vi.setSystemTime(0)
  const timeout = new Error('本轮探针真实超时')
  const scan = vi.spyOn(table, 'readProcessTable')
    .mockImplementationOnce(async () => {
      vi.setSystemTime(78)
      throw timeout
    })
    .mockImplementation(async () => {
      vi.setSystemTime(80)
      throw timeout
    })
  const throwIfAborted = AbortSignal.prototype.throwIfAborted
  vi.spyOn(AbortSignal.prototype, 'throwIfAborted').mockImplementation(function (this: AbortSignal) {
    throwIfAborted.call(this)
    // 模拟外层预算检查与实际扫描之间正常经过 1ms，不依赖真实机器调度。
    if (scan.mock.calls.length === 1 && Date.now() === 78) {
      vi.setSystemTime(79)
    }
  })
  const child = Object.assign(new EventEmitter(), { pid: 123, exitCode: 0, signalCode: null }) as ChildProcess
  const tree = createWorkflowProcessTree(child, Promise.resolve(), { cleanupMs: 80 })
  const error: unknown = await tree.stop().catch(error => error)
  expect(error).toBeInstanceOf(AggregateError)
  expect((error as AggregateError).errors).toContain(timeout)
  expect((error as AggregateError).errors.some(error => String(error).includes('预算已耗尽'))).toBe(true)
  expect(scan.mock.calls.map(call => call[0])).toEqual([80])
  expect(Date.now()).toBe(79)
  expect(vi.getTimerCount()).toBe(0)
})
