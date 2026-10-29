import { assertWatchCommandActive } from './cancellation'
import { prepareWatchMemorySource, spawnWithWatchMemorySource } from './memory/source'
import { prepareWatchIdentitySource } from './process-identity'

/** 所有身份查询准备发生在业务启动前；内存与身份宿主各自保留关闭责任。 */
export async function spawnWithWatchResources<T>(cwd: string, spawnChild: () => T, prepareIdentity = prepareWatchIdentitySource, prepareMemory = prepareWatchMemorySource) {
  assertWatchCommandActive()
  const identitySource = await prepareIdentity()
  try {
    return { ...await spawnWithWatchMemorySource(cwd, () => {
      identitySource?.ensureRunning()
      return spawnChild()
    }, prepareMemory), identitySource }
  }
  catch (error) {
    try {
      await identitySource?.close()
    }
    catch (closeError) {
      throw new AggregateError([error, closeError], 'Watch 启动失败且身份采集器回收未确认。')
    }
    throw error
  }
}
