import type { ChildProcess } from 'node:child_process'
import type { WatchMemorySource } from './memory/source'
import type { WatchIdentitySource } from './process-identity'
import { createMemorySampler } from './memory/sampler'
import { createWatchProcessController } from './process-controller'
import { createWatchResourceStop } from './process-stop'

/** 接入失败时仍保留已启动业务与两个独立宿主的收尾责任。 */
export async function initializeWatchRuntime(
  resources: { child: ChildProcess, memorySource: WatchMemorySource, identitySource?: WatchIdentitySource | undefined },
  sampling: Omit<Parameters<typeof createMemorySampler>[0], 'probe' | 'close'>,
  options: {
    phases?: NonNullable<Parameters<typeof createWatchProcessController>[1]>['phases']
    controller?: typeof createWatchProcessController
    sampler?: typeof createMemorySampler
  } = {},
) {
  const { child, memorySource, identitySource } = resources
  const controllerOptions = {
    ...(options.phases ? { phases: options.phases } : {}),
    ...(identitySource ? { identitySource } : {}),
  }
  let controller: ReturnType<typeof createWatchProcessController> | undefined
  let memorySampler: ReturnType<typeof createMemorySampler> | undefined
  try {
    controller = (options.controller ?? createWatchProcessController)(child, controllerOptions)
    memorySampler = (options.sampler ?? createMemorySampler)({
      ...sampling,
      probe: signal => memorySource.sample(child.pid, signal),
      close: () => memorySource.close(),
    })
    return { controller, memorySampler }
  }
  catch (error) {
    // 工厂尚未交出 controller 时，以原有身份规则接管活句柄，不向任意 PID 扩张。
    controller ??= createWatchProcessController(child, controllerOptions)
    const stop = createWatchResourceStop(memorySampler ?? { stop: () => memorySource.close() }, controller, () => {
      child.stdin?.destroy()
      child.stdout?.destroy()
      child.stderr?.destroy()
    })
    try {
      await stop()
    }
    catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Watch 资源接入失败且收尾失败。')
    }
    throw error
  }
}
