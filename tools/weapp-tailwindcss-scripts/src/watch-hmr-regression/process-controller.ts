import type { ChildProcess } from 'node:child_process'
import type { ProcessIdentity } from '../../../../scripts/demo-e2e-workflow/process-table'
import process from 'node:process'
import { createProcessOwnershipTracker } from '../../../../scripts/demo-e2e-workflow/process-ownership'
import { readProcessSubset, readProcessTable } from '../../../../scripts/demo-e2e-workflow/process-table'

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
interface StopPhase {
  signal: NodeJS.Signals
  waitMs: number
}
interface ControllerOptions {
  phases?: readonly StopPhase[]
  observer?: {
    table: typeof readProcessTable
    subset: (group: number | undefined, pids: readonly number[], timeoutMs: number, signal?: AbortSignal) => Promise<ProcessIdentity[]>
  }
}
export const WATCH_STOP_PHASES = [
  { signal: 'SIGINT', waitMs: 3000 },
  { signal: 'SIGTERM', waitMs: 2500 },
  { signal: 'SIGKILL', waitMs: 2500 },
] as const
// Web 原有停止总窗为 3000ms；在该窗口内为最终 KILL 的身份复核与退出确认预留后半段。
export const WEB_STOP_PHASES = [{ signal: 'SIGTERM', waitMs: 1500 }, { signal: 'SIGKILL', waitMs: 1500 }] as const
function queryBudget(remaining: number) {
  // execFile 探针原有 1000ms 回收期也属于调用方的绝对截止。
  if (remaining <= 1001) {
    throw new Error('进程身份查询剩余预算不足以确认探针回收，禁止继续调度。')
  }
  return remaining - 1000
}
/** 只终止本次活句柄与已登记出生身份，根 close 不能替代后代退出确认。 */
export function createWatchProcessController(child: ChildProcess, options: ControllerOptions = {}) {
  let didClose = false
  let spawnError: unknown
  const errors: unknown[] = []
  const closed = new Promise<void>((resolve) => {
    child.once('close', () => {
      didClose = true
      resolve()
    })
  })
  const onError = (error: Error) => {
    spawnError ??= error
    if (!errors.includes(error)) {
      errors.push(error)
    }
  }
  child.on('error', onError)
  const observer = options.observer ?? { table: readProcessTable, subset: readProcessSubset }
  const ownership = createProcessOwnershipTracker(child, closed, {
    observer: {
      table: (timeoutMs, signal) => observer.table(queryBudget(timeoutMs), signal),
      subset: (pids, timeoutMs, signal) => observer.subset(ownership.group, pids, queryBudget(timeoutMs), signal),
    },
  })
  let stopping: Promise<void> | undefined
  let trackingError: unknown
  const remember = (error: unknown) => {
    if (!errors.includes(error)) {
      errors.push(error)
    }
  }
  const bounded = async <T>(deadline: number, operation: (remaining: number, signal: AbortSignal) => Promise<T>, onAbort?: (reason: Error) => void) => {
    if (trackingError) {
      throw trackingError
    }
    const remaining = deadline - Date.now()
    queryBudget(remaining)
    const controller = new AbortController()
    const abort = setTimeout(() => {
      const reason = new Error('进程身份操作执行截止，等待原有探针回收。')
      controller.abort(reason)
      onAbort?.(reason)
    }, remaining - 1000)
    let timer: NodeJS.Timeout | undefined
    try {
      const current = await Promise.race([
        operation(remaining, controller.signal),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('进程身份操作关闭未在停止截止前确认。')), remaining)
        }),
      ])
      controller.signal.throwIfAborted()
      if (Date.now() > deadline) {
        throw new Error('进程身份操作结果迟到，不能确认按时退出。')
      }
      if (spawnError) {
        throw spawnError
      }
      return current
    }
    catch (error) {
      trackingError ??= error
      const reason = error instanceof Error ? error : new Error(String(error))
      controller.abort(reason)
      ownership.abortPending(reason)
      throw error
    }
    finally {
      clearTimeout(abort)
      clearTimeout(timer)
    }
  }
  const captureAt = (deadline: number) => bounded(deadline, () => ownership.capture(deadline), reason => ownership.abortPending(reason))
  const requestedRootSignals = new Set<NodeJS.Signals>()
  const signalRootHandle = (signal: NodeJS.Signals) => {
    if (!Number.isInteger(child.pid) || child.pid! <= 0 || didClose || child.exitCode !== null || child.signalCode !== null || requestedRootSignals.has(signal)) {
      return
    }
    requestedRootSignals.add(signal)
    try {
      child.kill(signal)
    }
    catch (error) {
      remember(error)
    }
  }
  const stop = async () => {
    const phases = options.phases ?? WATCH_STOP_PHASES
    const started = Date.now()
    let until = started
    let verified = false
    const complete = () => didClose && verified && ownership.current.size === 0
    for (const phase of phases) {
      until += phase.waitMs
      if (until <= Date.now()) {
        continue
      }
      try {
        const drainExisting = process.platform === 'win32' && ownership.capturing
        let latest = await captureAt(until)
        if (drainExisting) {
          // 停止前已开始的编译采集可能持有旧快照；同一截止内排空后重读，不能拿旧身份发信号。
          latest = await captureAt(until)
        }
        verified = true
        if (complete()) {
          break
        }
        const identities = [...latest.values()]
        // capture 已批量重读并匹配登记的出生身份；Windows 在同一同步续体逐 PID 发信号，避免为每个后代冷启动 PowerShell/taskkill。
        // 身份快照到信号仍非原子操作；不按历史 PPID、命令名或 cwd 扩大范围。
        const windowsLatest = process.platform === 'win32'
          ? latest
          : undefined
        for (const identity of identities.reverse()) {
          if (!Number.isInteger(identity.pid) || identity.pid <= 0) {
            continue
          }
          const remaining = until - Date.now()
          if (remaining <= (windowsLatest ? 0 : 1001)) {
            break
          }
          const current = windowsLatest
            ? windowsLatest.get(identity.pid)
            : (await bounded(until, (available, signal) => observer.subset(undefined, [identity.pid], queryBudget(available), signal))).find(row => row.pid === identity.pid)
          if (!current || current.started !== identity.started || current.zombie || Date.now() >= until) {
            continue
          }
          try {
            // Windows 的 SIGINT/TERM/KILL 均为单进程强制终止，与原 taskkill /pid /f 一致，不递归扩张。
            process.kill(current.pid, phase.signal)
            if (current.pid === child.pid) {
              requestedRootSignals.add(phase.signal)
            }
          }
          catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
              remember(error)
            }
          }
        }
      }
      catch (error) {
        verified = false
        remember(error)
        if (Date.now() < until) {
          signalRootHandle(phase.signal)
        }
      }
      while (Date.now() < until) {
        const remaining = until - Date.now()
        if (remaining > 1001 && !trackingError) {
          try {
            await captureAt(until)
            verified = true
          }
          catch (error) {
            verified = false
            remember(error)
          }
          if (complete()) {
            break
          }
        }
        await delay(Math.min(25, Math.max(0, until - Date.now())))
      }
      if (complete()) {
        break
      }
    }
    if (!complete()) {
      // 不再派发探针或延长等待；本次正 PID 活句柄仍须获得最后的终止请求。
      signalRootHandle('SIGKILL')
      remember(new Error(`watch 子进程停止未确认：close=${didClose}，仍记录 PID=${[...ownership.current.keys()].join(',')}。`))
    }
    if (spawnError) {
      remember(spawnError)
    }
    if (didClose) {
      child.off('error', onError)
    }
    if (errors.length === 1) {
      throw errors[0]
    }
    if (errors.length) {
      throw new AggregateError(errors, `watch 子进程收尾失败：${errors.map(String).join('；')}`)
    }
  }
  return {
    snapshot: () => ownership.current,
    ensureRunning() {
      if (spawnError) {
        throw spawnError
      }
      if (trackingError) {
        throw trackingError
      }
    },
    capture() {
      if (stopping) {
        return Promise.reject(new Error('watch 已停止，不再接受外部归属采集。'))
      }
      return captureAt(Date.now() + 5000)
    },
    stop() {
      stopping ??= stop()
      return stopping
    },
  }
}
