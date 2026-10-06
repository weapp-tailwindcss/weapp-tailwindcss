import type { WatchSession } from '../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/types'

/** 只用于不持有源码写入或待回收资源的叶子操作，取消后不再继续调用链。 */
export async function awaitWithAbort<T>(signal: AbortSignal | undefined, run: () => Promise<T>): Promise<T> {
  signal?.throwIfAborted()
  if (!signal) {
    return run()
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    Promise.resolve().then(() => {
      signal.throwIfAborted()
      return run()
    }).then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

/** 超时发出取消信号，但必须等拥有写入权的任务退出后才能恢复源码。 */
export async function withAbortDeadline<T>(
  timeoutMs: number,
  message: string,
  run: (signal: AbortSignal) => Promise<T>,
  parent?: AbortSignal,
): Promise<T> {
  const controller = new AbortController()
  const onAbort = () => controller.abort(parent?.reason)
  parent?.addEventListener('abort', onAbort, { once: true })
  if (parent?.aborted) {
    onAbort()
  }
  const timer = setTimeout(() => controller.abort(new Error(message)), timeoutMs)
  try {
    controller.signal.throwIfAborted()
    const result = await run(controller.signal)
    controller.signal.throwIfAborted()
    return result
  }
  catch (error) {
    if (controller.signal.aborted && error !== controller.signal.reason) {
      throw new AggregateError([controller.signal.reason, error], `${String(controller.signal.reason)}\n${String(error)}`)
    }
    throw error
  }
  finally {
    clearTimeout(timer)
    parent?.removeEventListener('abort', onAbort)
  }
}
export function bindWatchSessionSignal(session: WatchSession, signal?: AbortSignal): WatchSession {
  return {
    ...session,
    signal,
    ensureRunning: () => {
      signal?.throwIfAborted()
      session.ensureRunning()
    },
  }
}
