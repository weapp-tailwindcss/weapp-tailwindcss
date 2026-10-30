import type { ChildProcess } from 'node:child_process'
import type { WorkflowProcessObserver } from './process-observer'
import type { ProcessIdentity } from './process-table'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { runProcessCommand } from './process-command'
import { createProcessOwnershipTracker, remainingProbeBudget } from './process-ownership'

interface CleanupOptions {
  cooperativeMs?: number
  cleanupMs?: number
  observer?: Pick<WorkflowProcessObserver, 'table' | 'subset'>
}

/** 仅清理独立组和已证明身份的后代；未登记的 double-fork 不属于确认范围。 */
export function createWorkflowProcessTree(child: ChildProcess, closed: Promise<unknown>, options: CleanupOptions = {}) {
  const ownership = createProcessOwnershipTracker(child, closed, options)
  const capture = ownership.capture
  let stopping: Promise<void> | undefined
  const stop = async (cooperative: boolean) => {
    if (!child.pid) {
      return
    }
    const errors: unknown[] = []
    const sent: Array<{ pid: number, started?: string, method: string }> = []
    const requestedSignals = new Set<'SIGTERM' | 'SIGKILL'>()
    const fail = (message: string): never => {
      const targets = sent.map(item => `pid=${item.pid} started=${item.started ?? '未采集（本次 spawn 身份）'} method=${item.method}`).join('；')
      const termination = sent.length
        ? [new Error(`已向本轮进程发送终止请求：${targets}；正常清理与源码恢复未确认。`)]
        : []
      throw new AggregateError([...errors, ...termination], message)
    }
    const terminateSpawnedChild = (signal: 'SIGTERM' | 'SIGKILL') => {
      if (ownership.didClose || child.exitCode !== null || child.signalCode !== null || requestedSignals.has(signal) || sent.some(item => item.pid === child.pid && item.method === signal)) {
        return
      }
      requestedSignals.add(signal)
      // 探针失败不能撤销本次 spawn 的活句柄；不使用旧 PID 或进程组快照扩大清理范围。
      try {
        if (!child.kill(signal)) {
          throw new Error(`本轮子进程 pid=${child.pid} 未接受 ${signal}`)
        }
        sent.push({ pid: child.pid!, method: signal })
      }
      catch (error) {
        errors.push(error)
      }
    }
    let current = ownership.current
    let verified = false
    const read = async (probeDeadline: number) => {
      let remaining: number
      try {
        remaining = remainingProbeBudget(probeDeadline)
      }
      catch {
        return false
      }
      // 已开始的周期扫描也共享截止时间，不能在 stop 后迟到回写旧身份。
      const task = capture(probeDeadline)
      const timer = setTimeout(() => ownership.abortPending(new Error('进程归属扫描超过清理截止时间。')), remaining)
      try {
        current = await task
        if (Date.now() > probeDeadline) {
          throw new Error('进程归属扫描结果超过清理截止时间，不能确认按时完成。')
        }
        verified = true
        return true
      }
      catch (error) {
        verified = false
        if (!errors.includes(error)) {
          errors.push(error)
        }
        if (Date.now() >= cooperativeDeadline) {
          terminateSpawnedChild(Date.now() >= deadline ? 'SIGKILL' : 'SIGTERM')
        }
        return false
      }
      finally {
        clearTimeout(timer)
      }
    }
    const complete = () => {
      if (!ownership.didClose || !verified || current.size !== 0) {
        return false
      }
      if (ownership.identityError && !errors.includes(ownership.identityError)) {
        errors.push(ownership.identityError)
      }
      if (sent.length || errors.length) {
        fail('阶段子进程清理未正常完成；清理未成功。')
      }
      return true
    }
    const cooperativeDeadline = Date.now() + (cooperative ? options.cooperativeMs ?? 30_000 : 0)
    const cleanupMs = options.cleanupMs ?? 2000
    const deadline = cooperativeDeadline + cleanupMs
    const graceDeadline = cooperativeDeadline + Math.floor(cleanupMs / 2)
    if (ownership.failure !== undefined && !cooperative) {
      terminateSpawnedChild('SIGTERM')
    }
    while (Date.now() < cooperativeDeadline) {
      // 合作窗口决定何时强制终止，不是身份查询预算；跨边界查询仍消耗预先固定的总截止。
      if (!await read(Math.min(Date.now() + 5000, deadline))) {
        // 合作窗口用于等待调用方请求的退出，探针失败不能抢先杀死负责收尾的消费者。
        // 错误仍保留，合作窗口结束后才用原清理预算重新核对身份并执行严格回收。
        const remaining = cooperativeDeadline - Date.now()
        if (remaining > 0) {
          await delay(remaining)
        }
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
      if (!available) {
        terminateSpawnedChild(value)
      }
      else if (available) {
        let latestRows: ProcessIdentity[] = []
        try {
          latestRows = await ownership.readSubset(ownership.group, [...current.keys()], remainingProbeBudget(deadline))
        }
        catch (error) {
          errors.push(error)
        }
        const latestByPid = new Map(latestRows.map(row => [row.pid, row]))
        for (const row of [...current.values()].reverse()) {
          if (Date.now() >= deadline) {
            break
          }
          try {
            const latest = latestByPid.get(row.pid)
            if (!latest || latest.started !== row.started || latest.zombie || Date.now() >= deadline) {
              continue
            }
            if (process.platform === 'win32') {
              // 每个 PID 均已核对出生时间；禁止 /t 按复用的历史 PPID 扩大范围。
              await runProcessCommand('taskkill', ['/pid', String(row.pid), '/f'], remainingProbeBudget(deadline))
              sent.push({ pid: row.pid, started: row.started, method: 'taskkill /pid /f' })
            }
            else {
              process.kill(row.pid, value)
              sent.push({ pid: row.pid, started: row.started, method: value })
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
    // 预算耗尽不再新建探针或等待；仍活的本次句柄不能因观察失败遗漏最后的终止请求。
    if (errors.length) {
      terminateSpawnedChild('SIGKILL')
    }
    fail(`阶段子进程有界清理未成功；close=${ownership.didClose}，仍记录 PID=${[...current.keys()].join(',')}；清理范围与源码恢复未确认。`)
  }
  return {
    capture(deadline?: number) {
      // 停止后不再接受周期扫描；只有 stop 内部可以继续核对本轮身份。
      if (stopping) {
        return Promise.resolve(ownership.current)
      }
      return capture(deadline)
    },
    stop(cooperative = false) {
      stopping ??= stop(cooperative)
      return stopping
    },
  }
}
