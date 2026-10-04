import type { ChildProcess } from 'node:child_process'
import type { ProcessIdentity } from './process-table'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { runProcessCommand } from './process-command'
import { collectOwnedProcesses, readProcessTable } from './process-table'

interface CleanupOptions {
  cooperativeMs?: number
  cleanupMs?: number
}

/** 仅清理独立组和已证明身份的后代；未登记的 double-fork 不属于确认范围。 */
export function createWorkflowProcessTree(child: ChildProcess, closed: Promise<unknown>, options: CleanupOptions = {}) {
  let group = process.platform === 'win32' ? undefined : child.pid
  let owned = new Map<number, ProcessIdentity>()
  let initialized = false
  let stopping: Promise<void> | undefined
  let didClose = false
  let pending: { promise: Promise<Map<number, ProcessIdentity>>, controller: AbortController } | undefined
  void closed.then(() => {
    didClose = true
  })
  const capture = (timeoutMs = 5000) => {
    if (pending) {
      return pending.promise
    }
    const controller = new AbortController()
    const promise = (async () => {
      if (!child.pid) {
        return new Map<number, ProcessIdentity>()
      }
      const rows = await readProcessTable(timeoutMs, controller.signal)
      if (!initialized) {
        const root = rows.find(row => row.pid === child.pid)
        if (root && child.exitCode === null && child.signalCode === null) {
          owned.set(root.pid, root)
        }
        initialized = true
      }
      const current = collectOwnedProcesses(rows, owned, group)
      const groupRows = group ? rows.filter(row => row.group === group && !row.zombie) : []
      if (groupRows.length && ![...current.values()].some(row => row.group === group)) {
        throw new Error(`本轮进程组缺少仍匹配的身份锚，不能重新领取 PGID=${group}；清理范围未确认。`)
      }
      if (!groupRows.length) {
        group = undefined
      }
      owned = current
      return current
    })().finally(() => {
      pending = undefined
    })
    pending = { promise, controller }
    return promise
  }
  const stop = async (cooperative: boolean) => {
    if (!child.pid) {
      return
    }
    const errors: unknown[] = []
    const signals = new Set<NodeJS.Signals>()
    let current = owned
    let verified = false
    const read = async (deadline: number) => {
      const remaining = deadline - Date.now()
      if (remaining <= 0) {
        return false
      }
      // 已开始的周期扫描也共享截止时间，不能在 stop 后迟到回写旧身份。
      const task = capture(remaining)
      const controller = pending?.controller
      const timer = setTimeout(() => controller?.abort(new Error('进程归属扫描超过清理截止时间。')), remaining)
      try {
        current = await task
        if (Date.now() > deadline) {
          throw new Error('进程归属扫描结果超过清理截止时间，不能确认按时完成。')
        }
        verified = true
        return true
      }
      catch (error) {
        verified = false
        errors.push(error)
        return false
      }
      finally {
        clearTimeout(timer)
      }
    }
    const complete = () => {
      if (!didClose || !verified || current.size !== 0) {
        return false
      }
      if (signals.size) {
        errors.push(new Error(`本轮已确认身份的进程通过 ${[...signals].join('/')} 终止；正常清理与源码恢复未确认。`))
      }
      if (errors.length) {
        throw new AggregateError(errors, '阶段子进程清理未正常完成。')
      }
      return true
    }
    const cooperativeDeadline = Date.now() + (cooperative ? options.cooperativeMs ?? 30_000 : 0)
    while (Date.now() < cooperativeDeadline) {
      if (!await read(cooperativeDeadline)) {
        break
      }
      if (complete()) {
        return
      }
      const remaining = cooperativeDeadline - Date.now()
      if (remaining > 0) {
        await delay(Math.min(100, remaining))
      }
    }
    const deadline = Date.now() + (options.cleanupMs ?? 2000)
    const graceDeadline = Date.now() + Math.floor((options.cleanupMs ?? 2000) / 2)
    for (const value of ['SIGTERM', 'SIGKILL'] as const) {
      if (Date.now() >= deadline) {
        break
      }
      const available = await read(deadline)
      if (complete()) {
        return
      }
      if (Date.now() >= deadline) {
        break
      }
      if (!available && !didClose && child.exitCode === null && child.signalCode === null) {
        // 进程表不可用时仅停止本次 spawn 的本体，归属失败仍保留。
        try {
          if (!child.kill(value)) {
            throw new Error(`本轮子进程 pid=${child.pid} 未接受 ${value}`)
          }
          signals.add(value)
        }
        catch (error) {
          errors.push(error)
        }
      }
      else if (available) {
        for (const row of [...current.values()].reverse()) {
          if (Date.now() >= deadline) {
            break
          }
          try {
            const latest = (await readProcessTable(deadline - Date.now())).find(item => item.pid === row.pid && item.started === row.started && !item.zombie)
            if (!latest || Date.now() >= deadline) {
              continue
            }
            signals.add(value)
            if (process.platform === 'win32') {
              // 每个 PID 均已核对出生时间；禁止 /t 按复用的历史 PPID 扩大范围。
              await runProcessCommand('taskkill', ['/pid', String(row.pid), '/f'], deadline - Date.now())
            }
            else {
              process.kill(row.pid, value)
            }
          }
          catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
              errors.push(error)
            }
          }
        }
      }
      const until = value === 'SIGTERM' ? graceDeadline : deadline
      while (Date.now() < until) {
        if (!await read(deadline)) {
          break
        }
        if (complete()) {
          return
        }
        const remaining = until - Date.now()
        if (remaining > 0) {
          await delay(Math.min(25, remaining))
        }
      }
    }
    throw new AggregateError(errors, `阶段子进程有界清理未成功；close=${didClose}，仍记录 PID=${[...current.keys()].join(',')}；清理范围与源码恢复未确认。`)
  }
  return {
    capture() {
      // 停止后不再接受周期扫描；只有 stop 内部可以继续核对本轮身份。
      if (stopping) {
        return Promise.resolve(owned)
      }
      return capture()
    },
    stop(cooperative = false) {
      stopping ??= stop(cooperative)
      return stopping
    },
  }
}
