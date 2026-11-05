import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import process from 'node:process'

interface NativeStartupCommandOptions {
  cwd: string
  signal: AbortSignal
  reject?: boolean
  onCleanup?: (operation: Promise<void>) => void
  stdout?: 'pipe' | 'inherit'
}

const shutdownByChild = new WeakMap<ChildProcess, Promise<void>>()

function signalOwnedGroup(pid: number, signal: NodeJS.Signals | 0) {
  try {
    process.kill(-pid, signal)
    return true
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
      return false
    }
    throw error
  }
}

function stopUnixGroup(pid: number) {
  return new Promise<void>((resolve, reject) => {
    const startedAt = Date.now()
    const killAt = startedAt + 1_000
    const deadline = startedAt + 2_000
    const failures: unknown[] = []
    let group: number | undefined = pid
    let killed = false
    let finished = false
    let lastProbeError: unknown
    let poll: ReturnType<typeof setTimeout> | undefined
    const signal = (value: NodeJS.Signals | 0) => {
      if (group === undefined) {
        return false
      }
      if (!signalOwnedGroup(group, value)) {
        // ESRCH 后永久撤销本轮组身份，重复 stop 也不能重新使用数字 PGID。
        group = undefined
        return false
      }
      return true
    }
    const finish = () => {
      finished = true
      clearTimeout(poll)
      if (failures.length > 0) {
        reject(new AggregateError([...new Set(failures)], '原生启动进程组终止失败'))
      }
      else {
        resolve()
      }
    }
    const gone = () => {
      try {
        const missing = !signal(0)
        lastProbeError = undefined
        return missing
      }
      catch (error) {
        lastProbeError = error
        return false
      }
    }
    const check = () => {
      if (finished) {
        return
      }
      if (gone()) {
        finish()
        return
      }
      const now = Date.now()
      if (!killed && now >= killAt) {
        killed = true
        try {
          if (!signal('SIGKILL')) {
            finish()
            return
          }
        }
        catch (error) {
          failures.push(error)
        }
        // KILL 返回只表示信号已发，组内无 stdio 后代也必须确认消失。
        if (gone()) {
          finish()
          return
        }
      }
      if (now >= deadline) {
        if (lastProbeError !== undefined) {
          failures.push(lastProbeError)
        }
        failures.push(new Error(`原生启动进程组 ${pid} 在 2000ms 收尾期限内未确认消失`))
        finish()
        return
      }
      poll = setTimeout(check, Math.min(25, (killed ? deadline : killAt) - now))
    }
    try {
      if (!signal('SIGTERM')) {
        finish()
        return
      }
    }
    catch (error) {
      failures.push(error)
    }
    check()
  })
}

function stopWindowsTree(pid: number) {
  return new Promise<void>((resolve, reject) => {
    let failure: unknown
    // Windows 必须先按根 PID 清理整树；先杀根进程会丢失后代归属。
    const taskkill = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    taskkill.once('error', (error) => {
      failure = error
    })
    const timer = setTimeout(() => {
      failure = new Error('原生启动 taskkill 超过本轮收尾预算')
      try {
        taskkill.kill('SIGKILL')
      }
      catch (error) {
        failure = new AggregateError([failure, error], '原生启动 taskkill 无法终止')
      }
    }, 4_000)
    taskkill.once('close', (code, signal) => {
      clearTimeout(timer)
      if (failure !== undefined || code !== 0) {
        reject(failure ?? new Error(`原生启动 taskkill 失败：exit=${code} signal=${signal}`))
      }
      else {
        resolve()
      }
    })
  })
}

function stopOwnedTree(child: ChildProcess, platform: NodeJS.Platform) {
  const previous = shutdownByChild.get(child)
  if (previous) {
    return previous
  }
  const stopping = child.pid === undefined
    ? Promise.resolve()
    : platform === 'win32' ? stopWindowsTree(child.pid) : stopUnixGroup(child.pid)
  shutdownByChild.set(child, stopping)
  return stopping
}

/** 调用方必须保留本轮 detached 根进程所有权；结束后仍等待组内取消升级。 */
export function terminateNativeStartupProcess(child: ChildProcess) {
  return stopOwnedTree(child, process.platform)
}

/** 取消后仍等待真实 close 和本轮进程树清理；整体期限及五秒排空由调用方 owner 统一管理。 */
export async function runNativeStartupCommand(file: string, args: string[], options: NativeStartupCommandOptions): Promise<string> {
  options.signal.throwIfAborted()
  const platform = process.platform
  const child = spawn(file, args, {
    cwd: options.cwd,
    detached: platform !== 'win32',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  let spawnFailure: unknown
  let stopping: Promise<void> | undefined
  child.stdout?.setEncoding('utf8')
  child.stdout?.on('data', (chunk: string) => {
    stdout += chunk
    if (options.stdout === 'inherit') {
      process.stdout.write(chunk)
    }
  })
  child.stderr?.setEncoding('utf8')
  child.stderr?.on('data', (chunk: string) => {
    stderr += chunk
    process.stderr.write(chunk)
  })
  child.once('error', (error) => {
    spawnFailure = error
  })
  const closed = new Promise<{ code: number | null, signal: NodeJS.Signals | null }>((resolve) => {
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  const aborted = () => {
    if (!stopping) {
      stopping = stopOwnedTree(child, platform)
      options.onCleanup?.(stopping)
    }
    // close 可能晚于取消失败；先登记拒绝处理，最终仍由本次命令交付失败。
    void stopping.catch(() => {})
  }
  options.signal.addEventListener('abort', aborted, { once: true })
  if (options.signal.aborted) {
    aborted()
  }
  try {
    const exit = await closed
    if (!stopping && platform !== 'win32' && spawnFailure === undefined) {
      // 根自然 close 不代表组内后代退出；返回成功前也要确认本轮组消失。
      stopping = stopOwnedTree(child, platform)
      options.onCleanup?.(stopping)
    }
    let cleanupFailure: unknown
    try {
      await stopping
    }
    catch (error) {
      cleanupFailure = error
    }
    if (cleanupFailure !== undefined) {
      const primary = options.signal.aborted ? options.signal.reason : cleanupFailure
      throw Object.assign(new AggregateError([...new Set([primary, cleanupFailure])], '原生启动命令及进程树清理失败'), { cause: primary })
    }
    options.signal.throwIfAborted()
    if (spawnFailure !== undefined) {
      throw spawnFailure
    }
    if (exit.code !== 0 && options.reject !== false) {
      throw new Error(`原生启动命令失败：${file}；exit=${exit.code} signal=${exit.signal}\n${stdout}\n${stderr}`)
    }
    return stdout
  }
  finally {
    options.signal.removeEventListener('abort', aborted)
  }
}
