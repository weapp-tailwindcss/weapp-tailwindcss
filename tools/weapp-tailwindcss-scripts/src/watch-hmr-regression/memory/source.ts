import type { spawn } from 'node:child_process'
import type { MemoryUsageSample } from '../types'
import process from 'node:process'
import { createProcessObserverTransport } from '../../../../../scripts/demo-e2e-workflow/process-observer/transport'
import { assertWatchCommandActive } from '../cancellation'
import { parseProcessTreeMemoryOnWindows, sampleProcessTreeMemory } from './process-tree'
import { windowsWatchMemoryArgs } from './windows'

/** 持久采集器已失效，不能借旧样本或新进程继续验证本次会话。 */
export class MemorySourceError extends Error {}

export interface WatchMemorySource {
  sample: (rootPid: number | undefined, signal: AbortSignal) => Promise<MemoryUsageSample>
  close: () => Promise<void>
}

interface MemorySourceOptions {
  platform?: NodeJS.Platform
  command?: string
  args?: string[]
  spawn?: typeof spawn
}

/** 同一个 Windows 本体执行一次真实准备和后续查询；准备结果不能计入运行指标。 */
export async function prepareWatchMemorySource(cwd: string, options: MemorySourceOptions = {}): Promise<WatchMemorySource> {
  if ((options.platform ?? process.platform) !== 'win32') {
    return { sample: (rootPid, signal) => sampleProcessTreeMemory(rootPid, signal, cwd), close: async () => {} }
  }
  const prepareDeadline = Date.now() + 15_000
  const transport = createProcessObserverTransport(options.command ?? 'powershell', options.args ?? windowsWatchMemoryArgs, options.spawn)
  let failure: MemorySourceError | undefined
  let intentionalAbort: unknown
  const fail = async (error: unknown): Promise<never> => {
    transport.invalidate(error)
    let cause = error
    try {
      await transport.close()
    }
    catch (closeError) {
      if (closeError !== error && !(error instanceof AggregateError && error.errors.includes(closeError))) {
        cause = new AggregateError([error, closeError], 'Watch 内存采集失败且收尾失败。')
      }
    }
    failure ??= new MemorySourceError(`Watch 内存采集会话失效；diagnostics=${JSON.stringify(transport.diagnostics())}`, { cause })
    throw failure
  }
  const read = async (rootPid: number | undefined, timeoutMs: number, signal?: AbortSignal): Promise<MemoryUsageSample> => {
    if (failure) {
      throw failure
    }
    const deadline = Date.now() + timeoutMs
    try {
      if (rootPid == null) {
        throw new Error('memory probe root process is unavailable')
      }
      const value = await transport.request({ kind: 'memory', rootPid, cwd }, timeoutMs, signal)
      const sample = parseProcessTreeMemoryOnWindows(JSON.stringify(value))
      // 同块坏行、取消与解析成本都属于本轮绝对截止，不能接受迟到的合法行。
      transport.assertHealthy()
      signal?.throwIfAborted()
      if (Date.now() >= deadline) {
        throw new Error('Watch memory sample exceeded its absolute deadline before acceptance')
      }
      if (!sample) {
        throw new Error('memory probe did not return a valid process tree sample')
      }
      return { at: Date.now(), ...sample }
    }
    catch (error) {
      // 仅精确匹配主动停止原因；超时后发生的取消不能掩盖原始失败或退出未确认。
      if (signal?.aborted && error === signal.reason) {
        intentionalAbort = error
        throw error
      }
      return fail(error)
    }
  }
  try {
    await read(transport.pid, prepareDeadline - Date.now())
  }
  catch (error) {
    throw new MemorySourceError('业务尚未启动：Watch 内存采集器准备失败。', { cause: error })
  }
  return {
    sample: (rootPid, signal) => read(rootPid, 5000, signal),
    async close() {
      try {
        await transport.close()
      }
      catch (error) {
        if (failure) {
          throw failure
        }
        if (intentionalAbort === undefined || error !== intentionalAbort) {
          throw new MemorySourceError('Watch 内存采集器收尾失败。', { cause: error })
        }
      }
      if (failure) {
        throw failure
      }
    },
  }
}

/** 准备完成后才启动业务；启动或取消失败时回收本次准备的采集器。 */
export async function spawnWithWatchMemorySource<T>(cwd: string, spawnChild: () => T, prepare = prepareWatchMemorySource) {
  assertWatchCommandActive()
  const memorySource = await prepare(cwd)
  try {
    assertWatchCommandActive()
    const startedAt = Date.now()
    return { child: spawnChild(), memorySource, startedAt }
  }
  catch (error) {
    try {
      await memorySource.close()
    }
    catch (closeError) {
      throw new AggregateError([error, closeError], 'Watch 启动失败且内存采集器收尾失败。')
    }
    throw error
  }
}
