import type { ProcessCommandOwner, ProcessCommandReceipt } from './process-command/owner'
import { execFile } from 'node:child_process'
import process from 'node:process'
import { assertProcessCommandOwner, createProcessCommandOwner, ProcessCommandCleanupError, retainProcessCommand } from './process-command/owner'

export { createProcessCommandOwner, ProcessCommandCleanupError } from './process-command/owner'
export type { ProcessCommandOwner, ProcessCommandReceipt } from './process-command/owner'

export interface RunProcessCommandOptions {
  /** 同一任务的查询与清理共享归属域，防止未确认回收后启动新探针。 */
  owner?: ProcessCommandOwner
  /** 允许调用方确认特定失败属于预期的空结果或兼容退出状态。 */
  acceptFailure?: (error: unknown, stdout: string, stderr: string) => boolean
}

/** 探针只启动本轮拥有的单个命令；异步等待让 close、取消与超时正常推进。 */
export async function runProcessCommand(command: string, args: string[], timeoutMs: number, signal?: AbortSignal, options?: RunProcessCommandOptions): Promise<string> {
  const owner = options?.owner ?? createProcessCommandOwner()
  assertProcessCommandOwner(owner)
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('进程探针预算已耗尽，禁止继续调度。')
  }
  signal?.throwIfAborted()
  return await new Promise<string>((resolve, reject) => {
    let callbackDone = false
    let closed = false
    let output = ''
    let failure: unknown
    let settled = false
    let complete!: () => void
    const completion = new Promise<void>((resolve) => {
      complete = resolve
    })
    const startedAt = Date.now()
    const receipt: ProcessCommandReceipt = { command, args: [...args], startedAt, executionDeadlineAt: startedAt + Math.ceil(timeoutMs) }
    let deadlineTimer: NodeJS.Timeout | undefined
    let reapTimer: NodeJS.Timeout | undefined
    const settle = (error?: unknown) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(deadlineTimer)
      clearTimeout(reapTimer)
      receipt.settledAt = Date.now()
      receipt.failure = error === undefined ? undefined : String(error)
      complete()
      if (error !== undefined) {
        reject(error)
      }
      else {
        resolve(output)
      }
    }
    const finish = () => {
      if (!callbackDone || !closed) {
        return
      }
      ownership.releaseHandle()
      clearTimeout(deadlineTimer)
      clearTimeout(reapTimer)
      settle(failure)
    }
    const awaitReap = () => {
      clearTimeout(deadlineTimer)
      if (settled || reapTimer) {
        return
      }
      receipt.reapDeadlineAt = Date.now() + 1000
      reapTimer = setTimeout(() => {
        receipt.reapTimedOutAt = Date.now()
        const error = new ProcessCommandCleanupError(`进程探针退出未确认：${command} pid=${child.pid} close=${closed} callback=${callbackDone}；禁止继续调度。`, resource, failure)
        ownership.markTerminal(error)
        settle(error)
      }, 1000)
    }
    const child = execFile(command, args, {
      encoding: 'utf8',
      windowsHide: true,
      timeout: Math.ceil(timeoutMs),
      killSignal: 'SIGKILL',
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, LC_ALL: 'C' },
      ...(signal ? { signal } : {}),
    }, (error, stdout, stderr) => {
      callbackDone = true
      receipt.callbackAt = Date.now()
      output = stdout ?? ''
      const errorOutput = stderr ?? ''
      if (error && !options?.acceptFailure?.(error, output, errorOutput)) {
        failure ??= error
        receipt.initialFailure ??= String(error)
      }
      // AbortSignal 的错误回调可早于 close；不能把探针留在后台就返回。
      if (error && !closed) {
        awaitReap()
      }
      finish()
    })
    receipt.pid = child.pid
    const resource = { child, receipt, settled: completion }
    const ownership = retainProcessCommand(owner, resource)
    child.once('exit', (code, signal) => {
      receipt.exitAt = Date.now()
      receipt.exitCode = code
      receipt.exitSignal = signal
    })
    child.once('close', (code, signal) => {
      closed = true
      receipt.closedAt = Date.now()
      receipt.closeCode = code
      receipt.closeSignal = signal
      finish()
    })
    // execFile 内置超时仍依赖 close 才调用回调，独立截止必须从启动时生效。
    deadlineTimer = setTimeout(() => {
      failure ??= new Error(`进程探针超时：${command} pid=${child.pid} timeoutMs=${timeoutMs}。`)
      receipt.initialFailure ??= String(failure)
      if (!closed) {
        receipt.terminationRequestedAt = Date.now()
        try {
          receipt.terminationResult = child.kill('SIGKILL')
        }
        catch (error) {
          receipt.terminationError = String(error)
          failure = new AggregateError([failure, error], '进程探针终止失败。')
        }
      }
      awaitReap()
      finish()
    }, Math.ceil(timeoutMs))
  })
}
