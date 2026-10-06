import type { ChildProcess } from 'node:child_process'
import type { CommandExit } from '../types'
import { spawnSync } from 'node:child_process'
import process from 'node:process'

const ownedGroups = new WeakMap<ChildProcess, number>()
const closedChildren = new WeakSet<ChildProcess>()
const shutdownWaitMs = 1000

/** 只记录本次 spawn 创建的独立进程组，不从外部 PID 猜测组归属。 */
export function registerProcessGroup(child: ChildProcess, detached: boolean) {
  if (process.platform !== 'win32' && detached && child.pid) {
    ownedGroups.set(child, child.pid)
  }
  child.once('close', () => {
    closedChildren.add(child)
    ownedGroups.delete(child)
  })
}

function signalOwnedTree(child: ChildProcess, signal: NodeJS.Signals, group?: number) {
  if (!child.pid) {
    return
  }
  if (process.platform === 'win32') {
    if (child.exitCode !== null || child.signalCode !== null || closedChildren.has(child)) {
      return
    }
    // Windows 的 child.kill 会直接结束根进程，必须先按仍存活的根 PID 清理后代。
    const result = spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      timeout: 5000,
      killSignal: 'SIGKILL',
      maxBuffer: 64 * 1024,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    if (result.error || result.status !== 0) {
      throw new Error(`taskkill pid=${child.pid} 失败，exit=${result.status} signal=${result.signal}\n${result.error?.message ?? ''}\n${result.stderr ?? ''}\n${result.stdout ?? ''}`, { cause: result.error })
    }
    return
  }

  if (group) {
    try {
      process.kill(-group, signal)
      return
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
        throw error
      }
    }
  }
  if (!closedChildren.has(child) && child.exitCode === null && child.signalCode === null && !child.kill(signal)) {
    throw new Error(`未能向子进程 pid=${child.pid} 发送 ${signal}`)
  }
}

/** 同步入口在 close 后失效，避免稍后向复用的 PID 或进程组发送信号。 */
export function signalProcessTree(child: ChildProcess, signal: NodeJS.Signals) {
  if (!closedChildren.has(child)) {
    signalOwnedTree(child, signal, ownedGroups.get(child))
  }
}

function waitForCleanup(closed: Promise<CommandExit>, isGroupGone: () => boolean) {
  return new Promise<boolean>((resolve, reject) => {
    let didClose = false
    let finished = false
    let lastProbeError: unknown
    const finish = (done: boolean, error?: unknown) => {
      finished = true
      clearTimeout(deadline)
      clearInterval(poll)
      if (error) {
        reject(error)
      }
      else {
        resolve(done)
      }
    }
    const check = () => {
      if (finished) {
        return
      }
      try {
        // 即使根进程 close，独立组内关闭管道的后代也可能仍在运行。
        const groupGone = isGroupGone()
        lastProbeError = undefined
        if (didClose && groupGone) {
          finish(true)
        }
      }
      catch (error) {
        // Darwin 在退出与回收之间可能暂时 EPERM；保留诊断直到本轮预算耗尽。
        lastProbeError = error
      }
    }
    const expire = () => finish(false, lastProbeError)
    const deadline = setTimeout(expire, shutdownWaitMs)
    const poll = setInterval(check, 25)
    void closed.then(() => {
      didClose = true
      check()
    })
    check()
  })
}

/** 清理预算独立于业务超时；只持有本轮开始时仍有效的组归属。 */
export async function stopProcessTree(child: ChildProcess, closed: Promise<CommandExit>, signal: NodeJS.Signals) {
  let group = ownedGroups.get(child)
  const errors: unknown[] = []
  const isGroupGone = () => {
    if (!group) {
      return true
    }
    try {
      process.kill(-group, 0)
      return false
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
        throw error
      }
      // 一旦组消失就永久撤销本轮句柄，不再对数字 PGID 发信号。
      group = undefined
      ownedGroups.delete(child)
      return true
    }
  }
  const signals = process.platform === 'win32' || signal === 'SIGKILL' ? [signal] : [signal, 'SIGKILL'] as const
  for (const nextSignal of signals) {
    try {
      signalOwnedTree(child, nextSignal, group)
    }
    catch (error) {
      errors.push(error)
    }
    try {
      if (await waitForCleanup(closed, isGroupGone)) {
        if (!errors.length) {
          return
        }
        break
      }
    }
    catch (error) {
      errors.push(error)
    }
  }
  const details = errors.map(error => error instanceof Error ? error.message : String(error)).join('\n')
  throw new AggregateError(errors, `子进程 pid=${child.pid ?? 'unknown'} 的有界清理未成功：需确认 close 和本轮进程组结束\n${details}`.trim())
}
