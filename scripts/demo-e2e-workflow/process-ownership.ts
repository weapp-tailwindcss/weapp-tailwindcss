import type { ChildProcess } from 'node:child_process'
import type { WorkflowProcessObserver } from './process-observer'
import type { ProcessIdentity } from './process-table'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { collectOwnedProcesses, readProcessSubset, readProcessTable } from './process-table'

export interface ProcessOwnershipOptions {
  observer?: Pick<WorkflowProcessObserver, 'table' | 'subset'>
}

export function remainingProbeBudget(deadline: number) {
  const remaining = deadline - Date.now()
  // 只剩最后一个毫秒时不能再建立有界探针；所有实际调度入口必须重新核对，
  // 不能沿用外层检查后已被调度开销消耗的预算。
  if (!Number.isFinite(remaining) || remaining <= 1) {
    throw new Error('进程归属扫描预算已耗尽，禁止继续调度。')
  }
  return remaining
}

/** 登记本轮出生身份；停止信号和成功条件由各调用方持有。 */
export function createProcessOwnershipTracker(child: ChildProcess, closed: Promise<unknown>, options: ProcessOwnershipOptions = {}) {
  let group = process.platform === 'win32' ? undefined : child.pid
  let owned = new Map<number, ProcessIdentity>()
  let initialized = false
  let didClose = false
  let pending: { promise: Promise<Map<number, ProcessIdentity>>, controller: AbortController, budget: { deadline: number } } | undefined
  let identityError: unknown
  let captureError: unknown
  const readTable = (timeoutMs: number, signal: AbortSignal) => options.observer
    ? options.observer.table(timeoutMs, signal)
    : readProcessTable(timeoutMs, signal)
  const readSubset = (group: number | undefined, pids: number[], timeoutMs: number, signal?: AbortSignal) => options.observer
    ? options.observer.subset(pids, timeoutMs, signal)
    : readProcessSubset(group, pids, timeoutMs, signal)
  void closed.then(() => {
    didClose = true
  })
  const capture = (deadline = Date.now() + 5000) => {
    if (pending) {
      pending.budget.deadline = Math.min(pending.budget.deadline, deadline)
      return pending.promise
    }
    const controller = new AbortController()
    const budget = { deadline }
    const assertCurrent = () => {
      controller.signal.throwIfAborted()
      if (Date.now() > budget.deadline) {
        throw new Error('进程归属扫描结果超过截止时间，不能更新身份。')
      }
    }
    const scan = async () => {
      controller.signal.throwIfAborted()
      const remaining = remainingProbeBudget(budget.deadline)
      const exited = child.exitCode !== null || child.signalCode !== null
      const rows = initialized && (didClose || exited)
        ? await readSubset(group, [...owned.keys()], remaining, controller.signal)
        : await readTable(remaining, controller.signal)
      assertCurrent()
      return rows
    }
    const promise = (async () => {
      if (!child.pid) {
        return new Map<number, ProcessIdentity>()
      }
      const running = () => child.exitCode === null && child.signalCode === null
      const wasRunning = running()
      let rows = await scan()
      if (!initialized) {
        // 系统快照可能先观察到退出，ChildProcess 的 close/exit 尚未进入 JS；同一绝对预算内等待身份或退出。
        while (running() && !rows.some(row => row.pid === child.pid && !row.zombie)) {
          const remaining = budget.deadline - Date.now()
          if (remaining <= 0) {
            throw new Error(`本轮仍运行的子进程 pid=${child.pid} 缺少启动身份，采集预算已耗尽，不能确认后代归属。`)
          }
          await Promise.race([closed, delay(Math.min(25, remaining))])
          assertCurrent()
          if (running()) {
            if (Date.now() >= budget.deadline) {
              throw new Error(`本轮仍运行的子进程 pid=${child.pid} 缺少启动身份，采集预算已耗尽，不能确认后代归属。`)
            }
            rows = await scan()
          }
        }
      }
      if (!initialized && wasRunning && !running() && group && rows.some(row => row.group === group && !row.zombie)) {
        // 首次扫描跨越本体退出时，旧快照不能证明根身份；同一预算内重采，仅空组可自然收尾。
        rows = await scan()
      }
      assertCurrent()
      if (!initialized) {
        const root = rows.find(row => row.pid === child.pid && !row.zombie)
        if (root && running()) {
          owned.set(root.pid, root)
        }
        initialized = true
      }
      const current = collectOwnedProcesses(rows, owned, group)
      const groupRows = group ? rows.filter(row => row.group === group && !row.zombie) : []
      if (groupRows.length && ![...current.values()].some(row => row.group === group)) {
        identityError = new Error(`本轮进程组缺少仍匹配的身份锚，不能重新领取 PGID=${group}；清理范围未确认。`)
        throw identityError
      }
      if (!groupRows.length) {
        group = undefined
      }
      owned = current
      return new Map([...current].map(([pid, row]) => [pid, { ...row }]))
    })().catch((error) => {
      captureError ??= error
      throw error
    }).finally(() => {
      pending = undefined
    })
    pending = { promise, controller, budget }
    return promise
  }
  return {
    capture,
    readSubset,
    abortPending(reason: Error) { pending?.controller.abort(reason) },
    get current() { return new Map([...owned].map(([pid, row]) => [pid, { ...row }])) },
    get group() { return group },
    get didClose() { return didClose },
    get capturing() { return pending !== undefined },
    get failure() { return captureError },
    get identityError() { return identityError },
  }
}
