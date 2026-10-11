import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { collectOwnedProcesses, parsePosixProcesses, readProcessSubset } from '../scripts/demo-e2e-workflow/process-table'
import * as table from '../scripts/demo-e2e-workflow/process-table'
import { createWorkflowProcessTree } from '../scripts/demo-e2e-workflow/process-tree'

const at = (second: number) => `2026-10-04T12:00:${String(second).padStart(2, '0')}Z`
const row = (pid: number, parent: number, group: number, second: number) => ({ pid, parent, group, started: at(second) })
const platform = process.platform
afterEach(() => {
  Object.defineProperty(process, 'platform', { value: platform })
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('取消只能清理仍有身份证据的本轮进程', () => {
  it('PID 复用后的历史 PPID 不能认领更早出生的 Windows 进程', () => {
    const root = row(100, 1, 0, 10)
    const staleOrphan = row(200, 100, 0, 5)
    const child = row(300, 100, 0, 11)
    expect([...collectOwnedProcesses([root, staleOrphan, child], new Map([[100, root]])).keys()]).toEqual([100, 300])
  })

  it('PGID 数字复用后没有身份锚，不认领无关进程组', () => {
    const original = row(100, 1, 100, 10)
    expect(collectOwnedProcesses([row(100, 1, 100, 20), row(200, 100, 100, 21)], new Map([[100, original]]), 100).size).toBe(0)
  })

  it('父退出后仍保留已登记独立后代，丢失身份或 PID 复用则撤销', () => {
    const root = row(100, 1, 100, 10)
    const child = row(200, 100, 200, 11)
    const first = collectOwnedProcesses([root, child], new Map([[100, root]]), 100)
    expect([...collectOwnedProcesses([{ ...child, parent: 1 }], first).keys()]).toEqual([200])
    expect(collectOwnedProcesses([row(200, 1, 200, 20)], first).size).toBe(0)
  })

  it('POSIX 进程身份包含启动时间并排除僵尸存活判定', () => {
    const rows = parsePosixProcesses('100 1 100 Sun Oct  4 12:00:10 2026 Ss\n200 100 100 Sun Oct  4 12:00:11 2026 Z')
    expect(rows).toHaveLength(2)
    expect(rows[1]?.zombie).toBe(true)
    expect(collectOwnedProcesses(rows, new Map([[100, rows[0]!]]), 100).size).toBe(1)
  })

  it('进程表失败仍停止本次 spawn 的本体，保留无法核实后代的错误', async () => {
    vi.spyOn(table, 'readProcessTable').mockImplementation(() => {
      throw new Error('ps probe failed')
    })
    const child = new EventEmitter() as ChildProcess
    let done!: () => void
    const closed = new Promise<void>((resolve) => {
      done = resolve
    })
    Object.assign(child, { pid: 123, exitCode: null, signalCode: null })
    const kill = vi.fn(() => {
      Object.assign(child, { exitCode: 0 })
      done()
      return true
    })
    child.kill = kill
    const tree = createWorkflowProcessTree(child, closed, { cleanupMs: 50 })
    await expect(tree.stop()).rejects.toThrow('清理未成功')
    expect(kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('已登记 PID 消失后 POSIX 空快照视为已清理', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' })
    const command = vi.spyOn(await import('../scripts/demo-e2e-workflow/process-command'), 'runProcessCommand')
    command.mockResolvedValueOnce('')
    await expect(readProcessSubset(undefined, [123], 500)).resolves.toEqual([])
    expect(command).toHaveBeenCalledWith('ps', ['-p', '123', '-o', 'pid=,ppid=,pgid=,lstart=,stat='], 500, undefined, expect.objectContaining({ acceptFailure: expect.any(Function) }))
  })

  it('Windows 的空 PID 子集不派发 PowerShell，消失 PID 的空快照视为已清理', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    const command = vi.spyOn(await import('../scripts/demo-e2e-workflow/process-command'), 'runProcessCommand').mockResolvedValue('[]')
    await expect(readProcessSubset(undefined, [], 500)).resolves.toEqual([])
    expect(command).not.toHaveBeenCalled()
    await expect(readProcessSubset(undefined, [123], 500)).resolves.toEqual([])
    expect(command.mock.calls[0]?.[0]).toBe('powershell')
  })

  it.each(['linux', 'win32'])('%s 正常退出后按平台进程组和已登记身份锚读取，避免重复扫描整张进程表', async (target) => {
    Object.defineProperty(process, 'platform', { value: target })
    const group = target === 'win32' ? 0 : 123
    const childRow = row(200, 123, group, 11)
    const fullScan = vi.spyOn(table, 'readProcessTable').mockResolvedValue([row(123, 1, group, 10), childRow])
    const subsetScan = vi.spyOn(table, 'readProcessSubset').mockResolvedValue([])
    const child = new EventEmitter() as ChildProcess
    let close!: () => void
    const closed = new Promise<void>((resolve) => {
      close = resolve
    })
    Object.assign(child, { pid: 123, exitCode: null, signalCode: null })
    const tree = createWorkflowProcessTree(child, closed)
    await tree.capture()
    Object.assign(child, { exitCode: 0 })
    close()
    await tree.stop()
    expect(fullScan).toHaveBeenCalledOnce()
    expect(subsetScan).toHaveBeenCalledOnce()
    expect(subsetScan).toHaveBeenCalledWith(target === 'win32' ? undefined : 123, [123, 200], expect.any(Number), expect.any(AbortSignal))
  })

  it.each(['linux', 'win32'])('%s 初次快照缺少根身份时在同一预算内复核，不提交空归属', async (target) => {
    Object.defineProperty(process, 'platform', { value: target })
    const root = row(123, 1, target === 'win32' ? 0 : 123, 10)
    const scan = vi.spyOn(table, 'readProcessTable').mockResolvedValueOnce([]).mockResolvedValueOnce([root])
    const child = Object.assign(new EventEmitter(), { pid: 123, exitCode: null, signalCode: null }) as ChildProcess
    const tree = createWorkflowProcessTree(child, new Promise(() => {}))
    await expect(tree.capture()).resolves.toEqual(new Map([[123, root]]))
    expect(scan).toHaveBeenCalledTimes(2)
    expect(scan.mock.calls[1]?.[0]).toBeLessThan(scan.mock.calls[0]![0]!)
  })

  it.each(['linux', 'win32'])('%s 系统已无短命令但 close 异步到达时正常结束，不误报缺根身份', async (target) => {
    Object.defineProperty(process, 'platform', { value: target })
    const scan = vi.spyOn(table, 'readProcessTable').mockResolvedValue([])
    const child = Object.assign(new EventEmitter(), { pid: 123, exitCode: null, signalCode: null }) as ChildProcess
    let close!: () => void
    const tree = createWorkflowProcessTree(child, new Promise<void>((resolve) => {
      close = resolve
    }))
    const captured = tree.capture()
    await new Promise(resolve => setTimeout(resolve, 5))
    Object.assign(child, { exitCode: 0 })
    close()
    await expect(captured).resolves.toEqual(new Map())
    await expect(tree.stop()).resolves.toBeUndefined()
    expect(scan).toHaveBeenCalledOnce()
  })

  it.each(['linux', 'win32'])('%s 持续存活却缺少根身份只使用原绝对预算，不能延后截止', async (target) => {
    Object.defineProperty(process, 'platform', { value: target })
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const scan = vi.spyOn(table, 'readProcessTable').mockImplementation(async () => {
      vi.setSystemTime(Date.now() + 2500)
      return []
    })
    const child = Object.assign(new EventEmitter(), { pid: 123, exitCode: null, signalCode: null }) as ChildProcess
    const tree = createWorkflowProcessTree(child, new Promise(() => {}))
    const captured = tree.capture().catch(error => error)
    expect(String(await captured)).toContain('采集预算已耗尽')
    expect(Date.now()).toBe(5000)
    expect(scan.mock.calls[0]?.[0]).toBe(5000)
    expect(scan).toHaveBeenCalledTimes(2)
    expect(scan.mock.calls.at(-1)?.[0]).toBe(2500)
  })
})
