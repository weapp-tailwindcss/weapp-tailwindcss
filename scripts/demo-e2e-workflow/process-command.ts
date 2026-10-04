import { execFile } from 'node:child_process'
import process from 'node:process'

export interface RunProcessCommandOptions {
  /** 允许调用方确认特定失败属于预期的空结果或兼容退出状态。 */
  acceptFailure?: (error: unknown, stdout: string, stderr: string) => boolean
}

/** 探针只启动本轮拥有的单个命令；异步等待让 close、取消与超时正常推进。 */
export async function runProcessCommand(command: string, args: string[], timeoutMs: number, signal?: AbortSignal, options?: RunProcessCommandOptions): Promise<string> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('进程探针预算已耗尽，禁止继续调度。')
  }
  signal?.throwIfAborted()
  return await new Promise<string>((resolve, reject) => {
    let callbackDone = false
    let closed = false
    let output = ''
    let failure: unknown
    let deadlineTimer: NodeJS.Timeout | undefined
    let reapTimer: NodeJS.Timeout | undefined
    const finish = () => {
      if (!callbackDone || !closed) {
        return
      }
      clearTimeout(deadlineTimer)
      clearTimeout(reapTimer)
      if (failure) {
        reject(failure)
      }
      else {
        resolve(output)
      }
    }
    const awaitReap = () => {
      clearTimeout(deadlineTimer)
      if (reapTimer) {
        return
      }
      reapTimer = setTimeout(() => {
        reject(new Error(`进程探针退出未确认：${command} pid=${child.pid} close=${closed} callback=${callbackDone}；禁止继续调度。`, { cause: failure }))
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
      output = stdout ?? ''
      const errorOutput = stderr ?? ''
      if (error && !options?.acceptFailure?.(error, output, errorOutput)) {
        failure ??= error
      }
      // AbortSignal 的错误回调可早于 close；不能把探针留在后台就返回。
      if (error && !closed) {
        awaitReap()
      }
      finish()
    })
    child.once('close', () => {
      closed = true
      finish()
    })
    // execFile 内置超时仍依赖 close 才调用回调，独立截止必须从启动时生效。
    deadlineTimer = setTimeout(() => {
      failure ??= new Error(`进程探针超时：${command} pid=${child.pid} timeoutMs=${timeoutMs}。`)
      if (!closed) {
        try {
          child.kill('SIGKILL')
        }
        catch (error) {
          failure = new AggregateError([failure, error], '进程探针终止失败。')
        }
      }
      awaitReap()
      finish()
    }, Math.ceil(timeoutMs))
  })
}
