import type { ChildProcess } from 'node:child_process'
import type { ProcessIdentity } from '../scripts/demo-e2e-workflow/process-table'
import { EventEmitter } from 'node:events'
import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
import * as table from '../scripts/demo-e2e-workflow/process-table'
import { createWorkflowProcessTree } from '../scripts/demo-e2e-workflow/process-tree'

afterEach(() => vi.restoreAllMocks())
const root = { pid: 100, parent: 1, group: 100, started: '2026-10-04T12:00:10Z' }
const descendant = { pid: 200, parent: 100, group: 100, started: '2026-10-04T12:00:11Z' }

it('首次 capture 单飞，正常 exit 与 stop 等待同一快照后确认 close', async () => {
  let resolve!: (rows: ProcessIdentity[]) => void
  const probe = vi.spyOn(table, 'readProcessTable').mockImplementation(() => new Promise((yes) => {
    resolve = yes
  }))
  const child = Object.assign(new EventEmitter(), { pid: 100, exitCode: null, signalCode: null }) as ChildProcess
  let close!: () => void
  const closed = new Promise<void>((yes) => {
    close = yes
  })
  const tree = createWorkflowProcessTree(child, closed)
  const first = tree.capture()
  expect(tree.capture()).toBe(first)
  Object.assign(child, { exitCode: 0 })
  const stopping = tree.stop()
  close()
  resolve([])
  await expect(stopping).resolves.toBeUndefined()
  await first
  expect(probe).toHaveBeenCalledOnce()
  await tree.capture()
  expect(probe).toHaveBeenCalledOnce()
})

it.skipIf(process.platform === 'win32')('短命 root 首次扫描前退出，仍有 PGID 后代但身份锚缺失必须阻断', async () => {
  vi.spyOn(table, 'readProcessTable').mockResolvedValue([descendant])
  const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
  const child = Object.assign(new EventEmitter(), { pid: 100, exitCode: 0, signalCode: null }) as ChildProcess
  const tree = createWorkflowProcessTree(child, Promise.resolve(), { cleanupMs: 20 })
  await expect(tree.capture()).rejects.toThrow('缺少仍匹配的身份锚')
  await expect(tree.stop()).rejects.toThrow('清理未成功')
  expect(kill).not.toHaveBeenCalled()
})

it.skipIf(process.platform === 'win32')('close 不能掩盖已登记后代存活，强制终止仍报告恢复未确认', async () => {
  let rows = [root, descendant]
  vi.spyOn(table, 'readProcessTable').mockImplementation(async () => rows)
  const kill = vi.spyOn(process, 'kill').mockImplementation((pid) => {
    rows = rows.filter(row => row.pid !== pid)
    return true
  })
  const child = Object.assign(new EventEmitter(), { pid: 100, exitCode: null, signalCode: null }) as ChildProcess
  const tree = createWorkflowProcessTree(child, Promise.resolve())
  await tree.capture()
  Object.assign(child, { exitCode: 0 })
  rows = [{ ...descendant, parent: 1 }]
  await expect(tree.stop()).rejects.toThrow('清理未正常完成')
  expect(kill).toHaveBeenCalledExactlyOnceWith(200, 'SIGTERM')
})
