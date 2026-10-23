import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { EventEmitter, once } from 'node:events'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { afterEach, expect, it, vi } from 'vitest'
import * as table from '../scripts/demo-e2e-workflow/process-table'
import { createWorkflowProcessTree } from '../scripts/demo-e2e-workflow/process-tree'
import { formatWorkflowError } from '../scripts/e2e-preflight/cleanup'

const platform = process.platform
const root = { pid: 100, parent: 1, group: 100, started: '2026-10-04T12:00:10Z' }
const descendant = { pid: 200, parent: 100, group: 100, started: '2026-10-04T12:00:11Z' }

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: platform })
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it.each(['darwin', 'linux', 'win32'])('%s 已知探针失败先停止本体，reap 耗尽预算仍只强制停止同一本次句柄', async (target) => {
  Object.defineProperty(process, 'platform', { value: target })
  vi.useFakeTimers()
  vi.setSystemTime(0)
  const firstFailure = new Error('周期身份探针失败')
  const reapFailure = new Error('进程探针退出未确认', { cause: new Error('进程探针超时') })
  const scan = vi.spyOn(table, 'readProcessTable')
    .mockResolvedValueOnce([root, descendant])
    .mockRejectedValueOnce(firstFailure)
    .mockImplementation(async () => {
      // 探针花完原 80ms，随后报告原有 1000ms reap 失败；不得再开启等待预算。
      vi.setSystemTime(1080)
      throw reapFailure
    })
  const subset = vi.spyOn(table, 'readProcessSubset')
  const killPid = vi.spyOn(process, 'kill').mockReturnValue(true)
  const signals: Array<{ signal: NodeJS.Signals | number | undefined, at: number }> = []
  const child = Object.assign(new EventEmitter(), { pid: root.pid, exitCode: null, signalCode: null }) as ChildProcess
  child.kill = vi.fn((signal) => {
    signals.push({ signal, at: Date.now() })
    // 模拟本体忽略 TERM；KILL 也不能替代尚未收到的 close 确认。
    return true
  })
  const tree = createWorkflowProcessTree(child, new Promise(() => {}), { cleanupMs: 80 })
  await tree.capture()
  await expect(tree.capture()).rejects.toBe(firstFailure)
  const stopping = tree.stop()
  expect(tree.stop()).toBe(stopping)
  const error = await stopping.catch(error => error)
  expect(signals).toEqual([{ signal: 'SIGTERM', at: 0 }, { signal: 'SIGKILL', at: 1080 }])
  expect(error).toBeInstanceOf(AggregateError)
  expect(error.errors).toContain(reapFailure)
  expect(formatWorkflowError(error)).toContain('close=false')
  expect(formatWorkflowError(error)).toContain('method=SIGKILL')
  expect(killPid).not.toHaveBeenCalled()
  expect(subset).not.toHaveBeenCalled()
  expect(scan.mock.calls.map(call => call[0])).toEqual([5000, 5000, 80])
  expect(Date.now()).toBe(1080)
  expect(vi.getTimerCount()).toBe(0)
})

it.each(['running', 'exited', 'signalled', 'closed'] as const)('清理探针首次耗尽预算时仅终止仍活句柄：%s', async (state) => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  const failure = new Error('进程探针超时')
  const child = Object.assign(new EventEmitter(), { pid: root.pid, exitCode: null, signalCode: null, kill: vi.fn(() => true) }) as unknown as ChildProcess
  let close!: () => void
  const closed = new Promise<void>((resolve) => {
    close = resolve
  })
  const scan = vi.spyOn(table, 'readProcessTable').mockImplementation(async () => {
    vi.setSystemTime(80)
    if (state === 'exited') {
      Object.assign(child, { exitCode: 0 })
    }
    else if (state === 'signalled') {
      Object.assign(child, { signalCode: 'SIGTERM' })
    }
    else if (state === 'closed') {
      close()
    }
    throw failure
  })
  const killPid = vi.spyOn(process, 'kill').mockReturnValue(true)
  const tree = createWorkflowProcessTree(child, closed, { cleanupMs: 80 })
  const error = await tree.stop().catch(error => error)
  expect(error).toBeInstanceOf(AggregateError)
  expect(error.errors).toContain(failure)
  if (state === 'running') {
    expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL')
  }
  else {
    expect(child.kill).not.toHaveBeenCalled()
  }
  expect(killPid).not.toHaveBeenCalled()
  expect(scan).toHaveBeenCalledOnce()
  expect(Date.now()).toBe(80)
  expect(vi.getTimerCount()).toBe(0)
})

it('真实本体在探针失败后停止，POSIX 忽略 TERM 时升级且保留未确认错误', async () => {
  const child = spawn(process.execPath, ['-e', 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000); process.send("ready")'], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
  const closed = once(child, 'close')
  try {
    await once(child, 'message')
    const failure = new Error('周期身份探针失败')
    const timeout = new Error('清理身份探针超时')
    vi.spyOn(table, 'readProcessTable')
      .mockRejectedValueOnce(failure)
      .mockImplementation(async () => {
        await delay(30)
        throw timeout
      })
    const kill = vi.spyOn(child, 'kill')
    const tree = createWorkflowProcessTree(child, closed, { cleanupMs: 20 })
    await expect(tree.capture()).rejects.toBe(failure)
    const error = await tree.stop().catch(error => error)
    expect(error).toBeInstanceOf(AggregateError)
    expect(error.errors).toContain(timeout)
    expect(kill.mock.calls[0]?.[0]).toBe('SIGTERM')
    if (process.platform !== 'win32') {
      expect(kill.mock.calls.map(call => call[0])).toEqual(['SIGTERM', 'SIGKILL'])
    }
    await closed
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
    expect(formatWorkflowError(error)).toContain('清理范围与源码恢复未确认')
  }
  finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
    }
    await closed
  }
})

it.each(['throws', 'rejected'] as const)('活句柄终止请求 %s 时保留发送失败，不记录成功发送', async (mode) => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  const probeFailure = new Error('进程探针退出未确认')
  const signalFailure = new Error('终止权限不足')
  vi.spyOn(table, 'readProcessTable').mockImplementation(async () => {
    vi.setSystemTime(80)
    throw probeFailure
  })
  const child = Object.assign(new EventEmitter(), {
    pid: root.pid,
    exitCode: null,
    signalCode: null,
    kill: vi.fn(() => {
      if (mode === 'throws') {
        throw signalFailure
      }
      return false
    }),
  }) as unknown as ChildProcess
  const tree = createWorkflowProcessTree(child, new Promise(() => {}), { cleanupMs: 80 })
  const error = await tree.stop().catch(error => error)
  expect(error.errors).toContain(probeFailure)
  expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL')
  expect(formatWorkflowError(error)).toContain(mode === 'throws' ? '终止权限不足' : '未接受 SIGKILL')
  expect(formatWorkflowError(error)).not.toContain('已向本轮进程发送终止请求')
  expect(Date.now()).toBe(80)
  expect(vi.getTimerCount()).toBe(0)
})
