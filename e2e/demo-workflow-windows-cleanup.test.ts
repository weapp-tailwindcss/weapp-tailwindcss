import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
import * as table from '../scripts/demo-e2e-workflow/process-table'
import { createWorkflowProcessTree } from '../scripts/demo-e2e-workflow/process-tree'

const mocks = vi.hoisted(() => ({ command: vi.fn() }))
vi.mock('../scripts/demo-e2e-workflow/process-command', () => ({ runProcessCommand: mocks.command }))
const platform = process.platform
afterEach(() => {
  Object.defineProperty(process, 'platform', { value: platform })
  vi.restoreAllMocks()
})

it('Windows 只终止再次核对身份的 PID，既不 /t 扩散也不触碰复用 PID', async () => {
  Object.defineProperty(process, 'platform', { value: 'win32' })
  const root = { pid: 100, parent: 1, group: 0, started: '2026-10-04T12:00:10Z' }
  const childRow = { pid: 200, parent: 100, group: 0, started: '2026-10-04T12:00:11Z' }
  let rows = [root, childRow]
  vi.spyOn(table, 'readProcessTable').mockImplementation(async () => rows)
  vi.spyOn(table, 'readProcessSubset').mockImplementation(async () => rows)
  const child = Object.assign(new EventEmitter(), { pid: 100, exitCode: null, signalCode: null }) as ChildProcess
  let finish!: () => void
  const closed = new Promise<void>((resolve) => {
    finish = resolve
  })
  const tree = createWorkflowProcessTree(child, closed)
  await tree.capture()
  rows = [root, { ...childRow, parent: 1, started: '2026-10-04T12:00:20Z' }]
  mocks.command.mockImplementation(async () => {
    rows = rows.filter(row => row.pid !== 100)
    Object.assign(child, { exitCode: 0 })
    finish()
    return ''
  })
  await expect(tree.stop()).rejects.toThrow('清理未正常完成')
  expect(mocks.command).toHaveBeenCalledOnce()
  expect(mocks.command.mock.calls[0]?.slice(0, 2)).toEqual(['taskkill', ['/pid', '100', '/f']])
  expect(mocks.command.mock.calls[0]?.[2]).toBeLessThanOrEqual(2000)
  expect(rows).toEqual([{ ...childRow, parent: 1, started: '2026-10-04T12:00:20Z' }])
})

it.each(['linux', 'win32'])('%s 最后复查期间 PID 被复用时不向新进程发送终止请求', async (target) => {
  Object.defineProperty(process, 'platform', { value: target })
  const root = { pid: 100, parent: 1, group: target === 'win32' ? 0 : 100, started: '2026-10-04T12:00:10Z' }
  const reused = { ...root, started: '2026-10-04T12:00:20Z' }
  vi.spyOn(table, 'readProcessTable').mockResolvedValue([root])
  let close!: () => void
  const child = Object.assign(new EventEmitter(), { pid: 100, exitCode: null, signalCode: null }) as ChildProcess
  const closed = new Promise<void>((resolve) => {
    close = resolve
  })
  const tree = createWorkflowProcessTree(child, closed, { cleanupMs: 50 })
  const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
  mocks.command.mockClear()
  await tree.capture()
  vi.spyOn(table, 'readProcessSubset').mockImplementation(async () => {
    Object.assign(child, { exitCode: 0 })
    close()
    return [reused]
  })
  const stopping = tree.stop()
  // 最后复查返回的新身份也不能被旧 current 快照认领。
  if (target === 'win32') {
    await expect(stopping).resolves.toBeUndefined()
  }
  else {
    await expect(stopping).rejects.toThrow('清理未成功')
  }
  expect(kill).not.toHaveBeenCalled()
  expect(mocks.command).not.toHaveBeenCalled()
})
