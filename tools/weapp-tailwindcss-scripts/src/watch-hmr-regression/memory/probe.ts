import type { ChildProcess } from 'node:child_process'
import type { ObserverLaunchOptions } from '../../../../../scripts/demo-e2e-workflow/process-observer/launch-environment'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { resolveObserverLaunchEnvironment } from '../../../../../scripts/demo-e2e-workflow/process-observer/launch-environment'

export class MemoryProbeCleanupError extends Error {}
export class MemoryProbeAbortedError extends Error {}

/** 只管理本次创建的探针句柄；截止后仍必须确认 close，不能以已发送 kill 代表退出。 */
export function runMemoryProbe(command: string, args: string[], options: {
  signal: AbortSignal
  timeoutMs: number
  closeTimeoutMs?: number
  maxBuffer?: number
  spawnProcess?: typeof spawn
  launchOptions?: ObserverLaunchOptions
}): Promise<string> {
  const { signal } = options
  if (signal.aborted) {
    return Promise.reject(new MemoryProbeAbortedError('memory probe aborted', { cause: signal.reason }))
  }
  const expiresAt = Date.now() + options.timeoutMs
  return new Promise((resolve, reject) => {
    let child: ChildProcess
    const launch = resolveObserverLaunchEnvironment(command, options.launchOptions)
    const diagnostic = JSON.stringify(launch.diagnostic)
    try {
      child = (options.spawnProcess ?? spawn)(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        shell: false,
        env: launch.env,
      })
    }
    catch (error) {
      reject(error)
      return
    }

    const chunks: Buffer[] = []
    let stderr = ''
    let bytes = 0
    let failure: Error | undefined
    let closeTimer: ReturnType<typeof setTimeout> | undefined
    let settled = false
    let killing = false
    const cleanup = () => {
      clearTimeout(deadline)
      clearTimeout(closeTimer)
      signal.removeEventListener('abort', onAbort)
      child.stdout?.off('data', onData)
      child.stderr?.off('data', onStderr)
    }
    const finish = (error?: Error, value?: string) => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      if (error) {
        reject(error)
      }
      else {
        resolve(value ?? '')
      }
    }
    const recordKillFailure = (killError: unknown) => {
      const cause = failure
        ? new AggregateError([failure, killError], '内存探针失败且终止失败。')
        : killError
      failure = new MemoryProbeCleanupError(`memory probe kill failed; launch=${diagnostic}`, { cause })
    }
    const terminate = (error: Error) => {
      if (settled || closeTimer) {
        return
      }
      failure ??= error
      try {
        // 启动失败的句柄可能尚未释放；没有有效 PID 时不发信号，仍等待 close。
        if (child.pid != null && child.pid > 0) {
          killing = true
          child.kill('SIGKILL')
        }
      }
      catch (killError) {
        recordKillFailure(killError)
      }
      finally {
        killing = false
      }
      closeTimer = setTimeout(() => {
        finish(new MemoryProbeCleanupError(`memory probe close was not confirmed after termination; launch=${diagnostic}`, { cause: failure }))
      }, options.closeTimeoutMs ?? 1000)
    }
    const onAbort = () => terminate(new MemoryProbeAbortedError('memory probe aborted', { cause: signal.reason }))
    const onStreamError = (error: Error) => terminate(error)
    const onData = (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes > (options.maxBuffer ?? 2 * 1024 * 1024)) {
        terminate(new Error('memory probe output exceeded buffer limit'))
        return
      }
      chunks.push(chunk)
    }
    const onStderr = (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-1024)
    }
    const deadlineError = () => new Error(`memory probe exceeded ${options.timeoutMs}ms deadline; launch=${diagnostic}`)
    const deadline = setTimeout(() => terminate(deadlineError()), Math.max(0, expiresAt - Date.now()))
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onStderr)
    child.stdout?.on('error', onStreamError)
    child.stderr?.on('error', onStreamError)
    child.once('error', (error) => {
      // kill 可直接抛错，也可同步发出 error；两者都必须保留首错并终止采样。
      if (killing || (error as NodeJS.ErrnoException).syscall === 'kill') {
        recordKillFailure(error)
      }
      else {
        failure ??= error
      }
    })
    child.once('close', (code) => {
      child.stdout?.off('error', onStreamError)
      child.stderr?.off('error', onStreamError)
      finish(failure ?? (Date.now() >= expiresAt ? deadlineError() : code === 0 ? undefined : new Error(`memory probe exited with code ${code}: ${stderr.trim()}`)), Buffer.concat(chunks).toString('utf8'))
    })
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) {
      onAbort()
    }
  })
}
