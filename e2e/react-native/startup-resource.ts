import { runWithCleanup } from '../../scripts/e2e-preflight/cleanup'

/** 不可取消的资源准备晚到后，由原操作关闭资源，真实收尾继续由启动 owner 跟踪。 */
export async function awaitNativeStartupResource<T>(operation: () => Promise<T>, signal: AbortSignal | undefined, close: (resource: T) => Promise<void>): Promise<T> {
  signal?.throwIfAborted()
  const resource = await operation()
  if (signal?.aborted) {
    await runWithCleanup<never>(async () => {
      throw signal.reason
    }, () => close(resource))
  }
  return resource
}
