import type { ChildProcess } from 'node:child_process'
import type { ObserverLaunchOptions } from '../../../../../scripts/demo-e2e-workflow/process-observer/launch-environment'
import type { MemoryProbeContext } from './probe-diagnostics'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { resolveObserverLaunchEnvironment } from '../../../../../scripts/demo-e2e-workflow/process-observer/launch-environment'
import { attachMemoryProbeSnapshot, createMemoryProbeDiagnostics, memoryProbeErrorDetail } from './probe-diagnostics'

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
  diagnosticContext?: MemoryProbeContext
}): Promise<string> {
  const { signal } = options
  if (signal.aborted) {
    return Promise.reject(new MemoryProbeAbortedError('memory probe aborted', { cause: signal.reason }))
  }
  const expiresAt = Date.now() + options.timeoutMs
  const lifecycle = createMemoryProbeDiagnostics(command, args, {
    expiresAt,
    timeoutMs: options.timeoutMs,
    closeTimeoutMs: options.closeTimeoutMs ?? 1000,
    ...(options.diagnosticContext ? { context: options.diagnosticContext } : {}),
  })
  return new Promise((resolve, reject) => {
    let child: ChildProcess
    const launch = resolveObserverLaunchEnvironment(command, options.launchOptions)
    const diagnostic = JSON.stringify(launch.diagnostic)
    try {
      lifecycle.record('spawn-requested')
      child = (options.spawnProcess ?? spawn)(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        shell: false,
        env: launch.env,
      })
      lifecycle.bind(child)
    }
    catch (error) {
      lifecycle.record('spawn-threw', memoryProbeErrorDetail(error))
      attachMemoryProbeSnapshot(error, lifecycle.snapshot())
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
    let rejection: Error | undefined
    const contextualError = <T extends Error>(error: T) => {
      const snapshot = lifecycle.snapshot()
      error.message = `${error.message}; probe=${JSON.stringify(snapshot)}`
      attachMemoryProbeSnapshot(error, snapshot)
      return error
    }
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
      lifecycle.record('settled', { outcome: error ? 'rejected' : 'resolved' })
      cleanup()
      if (error) {
        rejection = error
        attachMemoryProbeSnapshot(error, lifecycle.snapshot())
        reject(error)
      }
      else {
        resolve(value ?? '')
      }
    }
    const recordKillFailure = (killError: unknown) => {
      lifecycle.record('kill-error', memoryProbeErrorDetail(killError))
      attachMemoryProbeSnapshot(killError, lifecycle.snapshot())
      const cause = failure
        ? new AggregateError([failure, killError], '内存探针失败且终止失败。')
        : killError
      failure = contextualError(new MemoryProbeCleanupError(`memory probe kill failed; launch=${diagnostic}`, { cause }))
    }
    const terminate = (error: Error) => {
      if (settled || closeTimer) {
        return
      }
      failure ??= error
      lifecycle.record('termination-requested', memoryProbeErrorDetail(error))
      attachMemoryProbeSnapshot(error, lifecycle.snapshot())
      try {
        // 启动失败的句柄可能尚未释放；没有有效 PID 时不发信号，仍等待 close。
        if (child.pid != null && child.pid > 0) {
          killing = true
          const result = child.kill('SIGKILL')
          lifecycle.record('kill-returned', { signal: 'SIGKILL', result })
        }
      }
      catch (killError) {
        recordKillFailure(killError)
      }
      finally {
        killing = false
      }
      closeTimer = setTimeout(() => {
        lifecycle.record('close-timeout')
        finish(contextualError(new MemoryProbeCleanupError(`memory probe close was not confirmed after termination; launch=${diagnostic}`, { cause: failure })))
      }, options.closeTimeoutMs ?? 1000)
    }
    const onAbort = () => terminate(new MemoryProbeAbortedError('memory probe aborted', { cause: signal.reason }))
    const onStdoutError = (error: Error) => {
      lifecycle.record('stdout-error', memoryProbeErrorDetail(error))
      terminate(error)
    }
    const onStderrError = (error: Error) => {
      lifecycle.record('stderr-error', memoryProbeErrorDetail(error))
      terminate(error)
    }
    const onSpawn = () => lifecycle.record('spawn')
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => lifecycle.record('exit', { code, signal })
    const onStdoutEnd = () => lifecycle.record('stdout-end')
    const onStdoutClose = () => lifecycle.record('stdout-close')
    const onStderrEnd = () => lifecycle.record('stderr-end')
    const onStderrClose = () => lifecycle.record('stderr-close')
    const onData = (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes > (options.maxBuffer ?? 2 * 1024 * 1024)) {
        lifecycle.record('buffer-limit', { bytes, maxBuffer: options.maxBuffer ?? 2 * 1024 * 1024 })
        terminate(new Error('memory probe output exceeded buffer limit'))
        return
      }
      chunks.push(chunk)
    }
    const onStderr = (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-1024)
    }
    const deadlineError = () => contextualError(new Error(`memory probe exceeded ${options.timeoutMs}ms deadline; launch=${diagnostic}`))
    const deadline = setTimeout(() => {
      lifecycle.record('deadline')
      terminate(deadlineError())
    }, Math.max(0, expiresAt - Date.now()))
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onStderr)
    child.stdout?.on('error', onStdoutError)
    child.stderr?.on('error', onStderrError)
    child.once('spawn', onSpawn)
    child.once('exit', onExit)
    child.stdout?.once('end', onStdoutEnd)
    child.stdout?.once('close', onStdoutClose)
    child.stderr?.once('end', onStderrEnd)
    child.stderr?.once('close', onStderrClose)
    child.once('error', (error) => {
      lifecycle.record('error', memoryProbeErrorDetail(error))
      // kill 可直接抛错，也可同步发出 error；两者都必须保留首错并终止采样。
      if (killing || (error as NodeJS.ErrnoException).syscall === 'kill') {
        recordKillFailure(error)
      }
      else {
        failure ??= error
        attachMemoryProbeSnapshot(error, lifecycle.snapshot())
      }
    })
    child.once('close', (code, signal) => {
      lifecycle.record('close', { code, signal })
      if (settled && rejection) {
        attachMemoryProbeSnapshot(rejection, lifecycle.snapshot(), 'probeClose')
      }
      child.off('spawn', onSpawn)
      child.off('exit', onExit)
      child.stdout?.off('end', onStdoutEnd)
      child.stdout?.off('close', onStdoutClose)
      child.stderr?.off('end', onStderrEnd)
      child.stderr?.off('close', onStderrClose)
      child.stdout?.off('error', onStdoutError)
      child.stderr?.off('error', onStderrError)
      if (settled) {
        return
      }
      const error = failure ?? (Date.now() >= expiresAt ? deadlineError() : code === 0 ? undefined : new Error(`memory probe exited with code ${code}: ${stderr.trim()}`))
      if (error) {
        attachMemoryProbeSnapshot(error, lifecycle.snapshot(), 'probeClose')
      }
      finish(error, Buffer.concat(chunks).toString('utf8'))
    })
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) {
      onAbort()
    }
  })
}
