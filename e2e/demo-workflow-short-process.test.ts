import type { ChildProcess } from 'node:child_process'
import type { ProcessIdentity } from '../scripts/demo-e2e-workflow/process-table'
import { EventEmitter } from 'node:events'
import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
import * as table from '../scripts/demo-e2e-workflow/process-table'
import { createWorkflowProcessTree } from '../scripts/demo-e2e-workflow/process-tree'
import { runStep } from '../scripts/demo-e2e-workflow/step'

const root = { pid: 100, parent: 1, group: 100, started: '2026-10-04T12:00:10Z' }
const descendant = { pid: 200, parent: 1, group: 100, started: '2026-10-04T12:00:11Z' }
const reused = { ...root, started: '2026-10-04T12:00:20Z' }
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function pendingSnapshot(later: ProcessIdentity[]) {
  let release!: (rows: ProcessIdentity[]) => void
  const probe = vi.spyOn(table, 'readProcessTable').mockResolvedValue(later).mockImplementationOnce(() => new Promise((resolve) => {
    release = resolve
  }))
  const child = Object.assign(new EventEmitter(), { pid: 100, exitCode: null, signalCode: null, kill: vi.fn(() => true) }) as unknown as ChildProcess
  let close!: () => void
  const closed = new Promise<void>((resolve) => {
    close = resolve
  })
  const exit = () => {
    Object.assign(child, { exitCode: 0 })
    close()
  }
  const tree = createWorkflowProcessTree(child, closed, { cleanupMs: 30 })
  return { probe, child, tree, exit, release: (rows = [root]) => release(rows) }
}

it.skipIf(process.platform === 'win32')('首次扫描跨越正常退出时丢弃旧非空快照，重新确认进程组已空', async () => {
  const { tree, exit, release, probe } = pendingSnapshot([])
  const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
  const first = tree.capture()
  expect(tree.capture()).toBe(first)
  exit()
  const stopping = tree.stop().catch(error => error)
  release()
  const [captured, stopped] = await Promise.all([first.catch(error => error), stopping])
  expect(captured).toEqual(new Map())
  expect(stopped).toBeUndefined()
  expect(probe).toHaveBeenCalledTimes(2)
  expect(probe.mock.calls[1]?.[1]).toBe(probe.mock.calls[0]?.[1])
  expect(kill).not.toHaveBeenCalled()
})

it.skipIf(process.platform === 'win32').each([[descendant], [reused]])('退出期间的新快照仍有无锚或复用的进程，拒绝认领：%j', async (current) => {
  const { tree, exit, release, probe, child } = pendingSnapshot([current])
  const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
  const directKill = vi.spyOn(child, 'kill').mockReturnValue(true)
  const first = tree.capture()
  exit()
  release()
  await expect(first).rejects.toThrow('缺少仍匹配的身份锚')
  expect(probe).toHaveBeenCalledTimes(2)
  await expect(tree.stop()).rejects.toThrow('清理未成功')
  expect(kill).not.toHaveBeenCalled()
  expect(directKill).not.toHaveBeenCalled()
})

it.skipIf(process.platform === 'win32')('已登记根进程的 PID 真正复用时不重新领取身份', async () => {
  const probe = vi.spyOn(table, 'readProcessTable').mockResolvedValue([root])
  const subsetProbe = vi.spyOn(table, 'readProcessSubset').mockResolvedValue([root])
  const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
  const child = Object.assign(new EventEmitter(), { pid: 100, exitCode: null, signalCode: null }) as ChildProcess
  let close!: () => void
  const tree = createWorkflowProcessTree(child, new Promise<void>((resolve) => {
    close = resolve
  }), { cleanupMs: 30 })
  await tree.capture()
  Object.assign(child, { exitCode: 0 })
  close()
  probe.mockResolvedValue([reused])
  subsetProbe.mockResolvedValue([reused])
  await expect(tree.capture()).rejects.toThrow('缺少仍匹配的身份锚')
  expect(probe).toHaveBeenCalledOnce()
  expect(subsetProbe).toHaveBeenCalledOnce()
  await expect(tree.stop()).rejects.toThrow('清理未成功')
  expect(kill).not.toHaveBeenCalled()
})

it.skipIf(process.platform === 'win32')('重采使用首次扫描剩余预算，不重置截止时间', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  const { tree, exit, release, probe } = pendingSnapshot([])
  const first = tree.capture()
  vi.setSystemTime(4500)
  exit()
  release()
  await expect(first).resolves.toEqual(new Map())
  expect(probe.mock.calls[0]?.[0]).toBe(5000)
  expect(probe.mock.calls[1]?.[0]).toBe(500)
  await tree.stop()
})

it.skipIf(process.platform === 'win32')('首次扫描耗尽预算时拒绝调度第二次扫描', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  const { tree, exit, release, probe } = pendingSnapshot([])
  const first = tree.capture()
  vi.setSystemTime(5001)
  exit()
  release()
  await expect(first).rejects.toThrow('超过截止时间')
  expect(probe).toHaveBeenCalledOnce()
  await tree.stop()
})

it.skipIf(process.platform === 'win32')('重采失败必须保留错误，不再重读碰运气', async () => {
  const { tree, exit, release, probe } = pendingSnapshot([])
  const failure = new Error('second scan failed')
  probe.mockRejectedValue(failure)
  const first = tree.capture()
  exit()
  release()
  await expect(first).rejects.toBe(failure)
  expect(probe).toHaveBeenCalledTimes(2)
})

it('扫描返回与身份写回之间的微任务耗尽预算时，拒绝迟到提交', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  vi.spyOn(table, 'readProcessTable').mockImplementation(async () => {
    void Promise.resolve().then(() => Promise.resolve().then(() => vi.setSystemTime(5001)))
    return [root]
  })
  const child = Object.assign(new EventEmitter(), { pid: 100, exitCode: null, signalCode: null }) as ChildProcess
  const tree = createWorkflowProcessTree(child, new Promise(() => {}))
  await expect(tree.capture()).rejects.toThrow('超过截止时间')
})

it.skipIf(process.platform === 'win32')('stop 收紧共享绝对截止，计时器未执行也不能在过期后补扫', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  const { tree, exit, release, probe } = pendingSnapshot([])
  const first = tree.capture().catch(error => error)
  exit()
  const stopping = tree.stop().catch(error => error)
  vi.setSystemTime(31)
  release()
  expect(String(await first)).toContain('超过截止时间')
  expect(await stopping).toBeInstanceOf(AggregateError)
  expect(probe).toHaveBeenCalledOnce()
})

it.skipIf(process.platform === 'win32')('stop 缩短预算后重采沿用取消信号，忽略取消的迟到响应不能放行', async () => {
  vi.useFakeTimers()
  const { tree, exit, release, probe } = pendingSnapshot([])
  let late!: (rows: ProcessIdentity[]) => void
  probe.mockImplementation(() => new Promise((resolve) => {
    late = resolve
  }))
  const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
  const first = tree.capture().catch(error => error)
  exit()
  const stopping = tree.stop().catch(error => error)
  release()
  await vi.advanceTimersByTimeAsync(0)
  expect(probe).toHaveBeenCalledTimes(2)
  expect(probe.mock.calls[1]?.[1]).toBe(probe.mock.calls[0]?.[1])
  await vi.advanceTimersByTimeAsync(31)
  expect(probe.mock.calls[1]?.[1]?.aborted).toBe(true)
  late([])
  expect(String(await first)).toContain('超过清理截止时间')
  expect(await stopping).toBeInstanceOf(AggregateError)
  expect(probe).toHaveBeenCalledTimes(2)
  expect(kill).not.toHaveBeenCalled()
})

it('真实空 Node 进程退出通过 runStep，不要求短阶段必须产生内存样本', async () => {
  const report = await runStep({ name: 'short process', command: process.execPath, args: ['-e', ''] }, 1, 1)
  expect(report.exitCode).toBe(0)
  expect(report.error).toBeUndefined()
})
