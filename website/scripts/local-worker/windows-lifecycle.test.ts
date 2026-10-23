import type { SpawnedHBuilderXCommand } from '../../../packages/hbuilderx-runner/src/types'
import type { WorkflowProcessObserver } from '../../../scripts/demo-e2e-workflow/process-observer'
import type { ProcessIdentity } from '../../../scripts/demo-e2e-workflow/process-table'
import { EventEmitter } from 'node:events'
import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
import * as processTools from '../../../packages/hbuilderx-runner/src/process'
import * as processCommand from '../../../scripts/demo-e2e-workflow/process-command'
import * as processObserver from '../../../scripts/demo-e2e-workflow/process-observer'
import * as processTable from '../../../scripts/demo-e2e-workflow/process-table'
import { withLocalCommand } from './lifecycle'

const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
const invocation = { command: 'synthetic-command', args: [], cwd: process.cwd() }
const identity = (pid: number, parent: number, second = 0): ProcessIdentity => ({ pid, parent, group: 0, started: new Date(Date.UTC(2026, 9, 14, 0, 0, second)).toISOString() })

function fixture(descendants: ProcessIdentity[] = []) {
  Object.defineProperty(process, 'platform', { ...platform, value: 'win32' })
  vi.useFakeTimers()
  const root = identity(50123, 50000)
  const state = { rows: [root, ...descendants] }
  const child = Object.assign(new EventEmitter(), { pid: root.pid, exitCode: null as number | null, signalCode: null })
  let resolveClose!: (exit: { code: number, signal: null }) => void
  const closed = new Promise<{ code: number, signal: null }>((resolve) => {
    resolveClose = resolve
  })
  const finishRoot = () => {
    if (child.exitCode !== null) {
      return
    }
    state.rows = state.rows.filter(row => row.pid !== root.pid)
    child.exitCode = 0
    child.emit('exit', 0, null)
    child.emit('close', 0, null)
    resolveClose({ code: 0, signal: null })
  }
  const stop = vi.fn(async () => {
    if (child.exitCode !== null) {
      return
    }
    state.rows = []
    finishRoot()
  })
  const table = vi.fn(async () => [...state.rows])
  const subset = vi.fn(async (pids: readonly number[]) => state.rows.filter(row => pids.includes(row.pid)))
  const close = vi.fn(async () => {})
  const observer: WorkflowProcessObserver = { table, subset, close, memory: vi.fn() }
  vi.spyOn(processObserver, 'prepareWorkflowProcessObserver').mockResolvedValue(observer)
  const spawn = vi.spyOn(processTools, 'spawnCommand').mockImplementation(options => ({ ...options, child, logs: [], closed, stop }) as unknown as SpawnedHBuilderXCommand)
  const terminate = vi.spyOn(processCommand, 'runProcessCommand').mockImplementation(async (_command, args) => {
    state.rows = state.rows.filter(row => row.pid !== Number(args[1]))
    return ''
  })
  return { root, state, child, finishRoot, table, subset, close, stop, spawn, terminate }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  Object.defineProperty(process, 'platform', platform)
})

it('Windows 缺少已准备的观察器时不启动命令', async () => {
  const item = fixture()
  vi.mocked(processObserver.prepareWorkflowProcessObserver).mockResolvedValueOnce(undefined)
  await expect(withLocalCommand(invocation, new AbortController().signal, vi.fn())).rejects.toThrow('身份观察器未准备')
  expect(item.spawn).not.toHaveBeenCalled()
})

it('spawn hook 在首次身份采集前执行，hook 失败也收尾本轮命令与观察器', async () => {
  const item = fixture()
  const failure = new Error('spawn hook failed')
  const hook = vi.fn(() => {
    expect(item.table).not.toHaveBeenCalled()
    throw failure
  })
  await expect(withLocalCommand(invocation, new AbortController().signal, vi.fn(), hook)).rejects.toBe(failure)
  expect(item.stop).toHaveBeenCalledOnce()
  expect(item.close).toHaveBeenCalledOnce()
})

it('Windows 先预热观察器并登记根身份，正常命令自然结束可以成功', async () => {
  const item = fixture()
  const action = vi.fn(async () => {
    item.finishRoot()
    return 'complete'
  })
  await expect(withLocalCommand(invocation, new AbortController().signal, action)).resolves.toBe('complete')
  expect(processObserver.prepareWorkflowProcessObserver).toHaveBeenCalledOnce()
  expect(item.spawn.mock.invocationCallOrder[0]).toBeGreaterThan(vi.mocked(processObserver.prepareWorkflowProcessObserver).mock.invocationCallOrder[0])
  expect(action.mock.invocationCallOrder[0]).toBeGreaterThan(item.table.mock.invocationCallOrder[0])
  expect(item.spawn).toHaveBeenCalledWith(expect.objectContaining({ detached: false }))
  expect(item.terminate).not.toHaveBeenCalled()
  expect(item.close).toHaveBeenCalledOnce()
})

it('首次采集跨越根退出时永久保留身份不足，不能把空子树当成功', async () => {
  const descendant = identity(50124, 50123, 1)
  const item = fixture([descendant])
  item.table.mockImplementationOnce(async () => {
    const stale = [...item.state.rows]
    item.finishRoot()
    return stale
  })
  const action = vi.fn()
  await expect(withLocalCommand(invocation, new AbortController().signal, action)).rejects.toThrow('启动身份未确认')
  expect(action).not.toHaveBeenCalled()
  expect(item.terminate).not.toHaveBeenCalled()
  expect(item.state.rows).toEqual([descendant])
  expect(item.close).toHaveBeenCalledOnce()
})

it('已登记根身份后自然退出不撤销首次证据，继续保留原始命令结果', async () => {
  const item = fixture()
  const collect = processTable.collectOwnedProcesses
  vi.spyOn(processTable, 'collectOwnedProcesses').mockImplementationOnce((...args) => {
    const owned = collect(...args)
    queueMicrotask(item.finishRoot)
    return owned
  })
  const action = vi.fn(async () => {
    expect(item.child.exitCode).toBe(0)
    return 'observed exit'
  })
  await expect(withLocalCommand(invocation, new AbortController().signal, action)).resolves.toBe('observed exit')
  expect(action).toHaveBeenCalledOnce()
  expect(item.close).toHaveBeenCalledOnce()
})

it('根退出后已登记后代自然结束无需强制终止，可以通过', async () => {
  const item = fixture([identity(50124, 50123, 1)])
  const result = withLocalCommand(invocation, new AbortController().signal, async () => {
    item.finishRoot()
    setTimeout(() => {
      item.state.rows = []
    }, 50)
    return 'complete'
  })
  await vi.advanceTimersByTimeAsync(200)
  await expect(result).resolves.toBe('complete')
  expect(item.terminate).not.toHaveBeenCalled()
  expect(item.subset).not.toHaveBeenCalled()
})

it('根退出后仍有已登记后代时按出生身份回收，并保留异常清理失败', async () => {
  const descendant = identity(50124, 50123, 1)
  const item = fixture([descendant])
  const result = withLocalCommand(invocation, new AbortController().signal, async () => item.finishRoot()).catch(error => error)
  await vi.advanceTimersByTimeAsync(2000)
  const error = await result
  expect(error).toBeInstanceOf(AggregateError)
  expect(error.message).toContain('子进程清理未正常完成')
  expect(item.terminate).toHaveBeenCalledWith('taskkill', ['/pid', String(descendant.pid), '/f'], expect.any(Number))
  expect(item.state.rows).toEqual([])
  expect(item.close).toHaveBeenCalledOnce()
})

it('根退出后仍匹配的活身份锚可发现新后代，禁止漏掉其残留', async () => {
  const parent = identity(50124, 50123, 1)
  const leaf = identity(50125, parent.pid, 2)
  const item = fixture([parent])
  const result = withLocalCommand(invocation, new AbortController().signal, async () => {
    item.finishRoot()
    item.state.rows = [parent, leaf]
    setTimeout(() => {
      item.state.rows = [leaf]
    }, 50)
  }).catch(error => error)
  await vi.advanceTimersByTimeAsync(2000)
  expect(await result).toBeInstanceOf(AggregateError)
  expect(item.terminate).toHaveBeenCalledWith('taskkill', ['/pid', String(leaf.pid), '/f'], expect.any(Number))
  expect(item.state.rows).toEqual([])
})

it('已登记 PID 被复用时不领取新身份，也不发送终止请求', async () => {
  const previous = identity(50124, 50123, 1)
  const replacement = identity(previous.pid, 50000, 2)
  const item = fixture([previous])
  await withLocalCommand(invocation, new AbortController().signal, async () => {
    item.finishRoot()
    item.state.rows = [replacement]
  })
  expect(item.terminate).not.toHaveBeenCalled()
  expect(item.state.rows).toEqual([replacement])
})

it('周期身份采集失败立即取消动作且仍回收观察器', async () => {
  const item = fixture()
  const failure = new Error('identity observer failed')
  item.table.mockResolvedValueOnce([item.root]).mockRejectedValueOnce(failure)
  const result = withLocalCommand(invocation, new AbortController().signal, async (_command, signal) => await new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })).catch(error => error)
  await vi.advanceTimersByTimeAsync(200)
  expect(await result).toBe(failure)
  expect(item.stop).toHaveBeenCalledOnce()
  expect(item.close).toHaveBeenCalledOnce()
})

it('超出初始采集绝对截止的晚到结果不能放行动作', async () => {
  const item = fixture()
  item.table.mockImplementationOnce(async () => await new Promise(resolve => setTimeout(resolve, 6000, [item.root])))
  const action = vi.fn()
  const result = withLocalCommand(invocation, new AbortController().signal, action).catch(error => error)
  await vi.advanceTimersByTimeAsync(6500)
  const error = await result as Error
  expect(error.message).toContain('超过截止时间')
  expect(action).not.toHaveBeenCalled()
  expect(item.close).toHaveBeenCalledOnce()
})

it('主动作与观察器收尾都失败时保留两侧错误', async () => {
  const item = fixture()
  const primary = new Error('browser assertion failed')
  const cleanup = new Error('observer close failed')
  item.close.mockRejectedValueOnce(cleanup)
  const error = await withLocalCommand(invocation, new AbortController().signal, async () => {
    throw primary
  }).catch(error => error)
  expect(error).toBeInstanceOf(AggregateError)
  expect(error.errors).toEqual([primary, cleanup])
})

it.each([false, true])('观察器收尾期间取消不会返回成功，也保留同时发生的收尾失败 (%s)', async (failCleanup) => {
  const item = fixture()
  const controller = new AbortController()
  const reason = new Error('cancelled during observer close')
  const cleanup = new Error('observer close failed')
  item.close.mockImplementationOnce(async () => {
    controller.abort(reason)
    if (failCleanup) {
      throw cleanup
    }
  })
  const error = await withLocalCommand(invocation, controller.signal, async () => 'complete').catch(error => error)
  if (failCleanup) {
    expect(error).toBeInstanceOf(AggregateError)
    expect(error.errors).toEqual([reason, cleanup])
  }
  else {
    expect(error).toBe(reason)
  }
})
