import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { execa } from 'execa'
import { createWindowsOwnedProcess, stopWindowsOwnedProcess } from './windows-owned-process.mjs'

const stopped = new WeakMap()
const owned = new WeakSet()

/** 创建本轮拥有的进程组；Windows 接线使用持有 Job 的专属 supervisor。 */
export function createOwnedProcess(file, args, options = {}) {
  const child = process.platform === 'win32'
    ? createWindowsOwnedProcess(file, args, options)
    : execa(file, args, { ...options, detached: true })
  owned.add(child)
  return child
}

async function stopUnixGroup(pid) {
  const started = Date.now()
  const killAt = started + 1_000
  const deadline = started + 2_000
  const failures = []
  let group = pid
  let killed = false
  let lastProbeError
  const signal = (value) => {
    if (group === undefined) {
      return false
    }
    try {
      process.kill(-group, value)
      return true
    }
    catch (error) {
      if (error.code !== 'ESRCH') {
        throw error
      }
      // 首次确认消失后永久撤销组身份，不能再次使用可能已被复用的数字 PGID。
      group = undefined
      return false
    }
  }
  const finish = () => {
    if (failures.length > 0) {
      throw new AggregateError([...new Set(failures)], '本轮进程组回收失败')
    }
  }
  let present = true
  try {
    present = signal('SIGTERM')
  }
  catch (error) {
    failures.push(error)
  }
  if (!present) {
    return finish()
  }
  while (true) {
    try {
      present = signal(0)
      lastProbeError = undefined
    }
    catch (error) {
      lastProbeError = error
    }
    if (!present) {
      return finish()
    }
    const now = Date.now()
    if (!killed && now >= killAt) {
      killed = true
      try {
        present = signal('SIGKILL')
      }
      catch (error) {
        failures.push(error)
      }
      if (!present) {
        return finish()
      }
    }
    if (now >= deadline) {
      if (lastProbeError) {
        failures.push(lastProbeError)
      }
      failures.push(new Error(`本轮进程组 ${pid} 在 2000ms 内未确认退出`))
      return finish()
    }
    await delay(Math.min(25, (killed ? deadline : killAt) - now))
  }
}

/** 只回收本轮创建的进程树，避免包装进程退出后子孙继续持有输出管道。 */
export function stopProcessTree(child) {
  if (!owned.has(child)) {
    return Promise.reject(new Error('不能回收不属于本轮创建入口的进程'))
  }
  const previous = stopped.get(child)
  if (previous) {
    return previous
  }
  const stopping = stopOwnedProcess(child)
  stopped.set(child, stopping)
  return stopping
}

async function stopOwnedProcess(child) {
  if (!child.pid) {
    return
  }
  if (process.platform === 'win32') {
    await stopWindowsOwnedProcess(child)
  }
  else {
    await stopUnixGroup(child.pid)
  }
}

/** 输出排空也必须有界；失败时释放本轮管道并报告，不再无限等待。 */
export async function settleOwnedProcess(child, timeout = 3_000) {
  let timer
  try {
    return await Promise.race([
      child.catch(error => error),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`本轮进程 ${child.pid} 在 ${timeout}ms 内未排空输出`)), timeout)
      }),
    ])
  }
  catch (error) {
    child.stdin?.destroy()
    child.stdout?.destroy()
    child.stderr?.destroy()
    throw error
  }
  finally {
    clearTimeout(timer)
  }
}

/** 保留原超时限制，先终止整个进程树，再等待输出结束并交还错误。 */
export async function runCommandWithProcessTree(file, args, { timeout = 600_000, ...options } = {}) {
  const child = createOwnedProcess(file, args, options)
  let timer
  let timedOut = false
  let failure
  try {
    await Promise.race([
      child,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true
          reject(new Error(`Command timed out after ${timeout} milliseconds: ${file}`))
        }, timeout)
      }),
    ])
  }
  catch (error) {
    failure = error
  }
  finally {
    clearTimeout(timer)
  }
  const cleanupFailures = []
  try {
    await stopProcessTree(child)
  }
  catch (error) {
    cleanupFailures.push(error)
  }
  let result
  try {
    result = await settleOwnedProcess(child)
  }
  catch (error) {
    cleanupFailures.push(error)
  }
  if (failure) {
    if (timedOut) {
      failure.stdout = result?.stdout
      failure.stderr = result?.stderr
    }
    if (cleanupFailures.length === 0) {
      throw failure
    }
  }
  if (cleanupFailures.length > 0) {
    const primary = failure ?? cleanupFailures[0]
    throw new AggregateError([...new Set([primary, ...cleanupFailures])], '命令执行或本轮进程树收尾失败', { cause: primary })
  }
  return result
}
