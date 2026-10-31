import type { spawn } from 'node:child_process'
import type { DemoE2eMemorySample } from '../../demo-e2e-memory'
import type { ProcessIdentity } from '../process-table'
import type { ObserverDiagnostics } from './diagnostics'
import type { ProcessObserverQuery } from './transport'
import process from 'node:process'
import { parseWindowsMemorySample } from '../../demo-e2e-memory/windows'
import { parseWindowsProcesses } from '../process-table'
import { parseObserverPreparation } from './preparation'
import { windowsObserverArgs } from './script'
import { createProcessObserverTransport, PROCESS_OBSERVER_HOST_STARTUP_MS, PROCESS_OBSERVER_PREPARE_MS } from './transport'

export interface WorkflowProcessObserver {
  table: (timeoutMs: number, signal?: AbortSignal) => Promise<ProcessIdentity[]>
  subset: (pids: readonly number[], timeoutMs: number, signal?: AbortSignal) => Promise<ProcessIdentity[]>
  memory: (rootPid: number, timeoutMs: number, signal?: AbortSignal) => Promise<DemoE2eMemorySample>
  close: (options?: { deadline?: number }) => Promise<void>
  constrainShutdown?: (deadline: number) => void
  assertHealthy?: () => void
  diagnostics?: () => ObserverDiagnostics
}

interface ObserverOptions {
  platform?: NodeJS.Platform
  command?: string
  args?: string[]
  prepareMs?: number
  spawn?: typeof spawn
}

/** 业务启动前准备一次热 CIM 会话；准备预算不能用于运行采集或清理。 */
export async function prepareWorkflowProcessObserver(signal?: AbortSignal, options: ObserverOptions = {}): Promise<WorkflowProcessObserver | undefined> {
  signal?.throwIfAborted()
  if ((options.platform ?? process.platform) !== 'win32') {
    return undefined
  }
  const startupDeadline = Date.now() + PROCESS_OBSERVER_HOST_STARTUP_MS
  const transport = createProcessObserverTransport(options.command ?? 'powershell', options.args ?? windowsObserverArgs, options.spawn)
  const read = async <T>(query: ProcessObserverQuery, parse: (value: unknown) => T, timeoutMs: number, requestSignal?: AbortSignal) => {
    const deadline = Date.now() + timeoutMs
    const rows = await transport.request(query, timeoutMs, requestSignal)
    try {
      const parsed = parse(rows)
      // 同一响应块的后续坏行可能在 Promise 续体前使会话失效，合法行不能掩盖该错误。
      transport.assertHealthy()
      requestSignal?.throwIfAborted()
      if (Date.now() >= deadline) {
        throw new Error('身份采集器结果超过本轮绝对截止，不能接受迟到数据。')
      }
      return parsed
    }
    catch (error) {
      transport.invalidate(error)
      await transport.close()
      throw error
    }
  }
  const identity = (pids: readonly number[] | undefined, timeoutMs: number, requestSignal?: AbortSignal) => read({ kind: 'identity', ...(pids === undefined ? {} : { pids }) }, value => parseWindowsProcesses(JSON.stringify(value)), timeoutMs, requestSignal)
  const memory = (rootPid: number, timeoutMs: number, requestSignal?: AbortSignal) => read({ kind: 'memory', rootPid, cwd: process.cwd() }, parseWindowsMemorySample, timeoutMs, requestSignal)
  try {
    const readyAt = await transport.waitUntilReady(startupDeadline - Date.now(), signal)
    transport.assertHealthy()
    signal?.throwIfAborted()
    // 宿主启动与真实查询各有独立绝对截止；同一快照验证身份与内存，不领取业务归属。
    const prepareDeadline = readyAt + (options.prepareMs ?? PROCESS_OBSERVER_PREPARE_MS)
    // 业务尚未存在，只查询本体一次；运行采样仍重新读取完整进程树，不能借用准备结果。
    await read({ kind: 'prepare', rootPid: transport.pid!, cwd: process.cwd() }, value => parseObserverPreparation(value, transport.pid!), prepareDeadline - Date.now(), signal)
    signal?.throwIfAborted()
    transport.assertHealthy()
    if (Date.now() >= prepareDeadline) {
      throw new Error('身份采集器预热超过本轮绝对截止，不能启动业务。')
    }
  }
  catch (error) {
    transport.invalidate(error)
    try {
      await transport.close()
    }
    catch (closeError) {
      if (closeError === error) {
        throw new Error('业务尚未启动：身份采集器准备失败。', { cause: error })
      }
      throw new AggregateError([error, closeError], '身份采集器准备失败且回收未确认。')
    }
    throw new Error('业务尚未启动：身份采集器准备失败。', { cause: error })
  }
  return {
    table: (timeoutMs, requestSignal) => identity(undefined, timeoutMs, requestSignal),
    subset: (pids, timeoutMs, requestSignal) => {
      requestSignal?.throwIfAborted()
      transport.assertHealthy()
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        return Promise.reject(new Error('身份采集器请求预算已耗尽，禁止继续调度。'))
      }
      const ids = [...new Set(pids)].filter(pid => Number.isInteger(pid) && pid > 0)
      return ids.length ? identity(ids, timeoutMs, requestSignal) : Promise.resolve([])
    },
    memory,
    close: options => transport.close(options),
    constrainShutdown: transport.constrainShutdown,
    assertHealthy: transport.assertHealthy,
    diagnostics: transport.diagnostics,
  }
}
