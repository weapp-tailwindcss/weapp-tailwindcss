import type { Plugin } from 'vite'

type Cleanup = () => void | Promise<void>
interface CleanupEntry {
  readonly dispose: Cleanup
  readonly order: number
  readonly rollbackOnly: boolean
}

/** 构建器先排空生成与扫描，再释放图关系、缓存和编译会话。 */
export const viteConstructionCleanupOrder = {
  generation: 10,
  discovery: 20,
  scan: 30,
  extensions: 35,
  relations: 40,
  roots: 50,
  diagnostics: 60,
  assets: 70,
  candidates: 80,
  compiler: 90,
  runtime: 100,
} as const

class VitePluginConstructionFailure extends Error {
  private completion?: Promise<never>

  constructor(readonly original: unknown, private readonly rollback: () => Promise<void>) {
    super('Vite 插件构造失败，等待释放已创建的资源。', { cause: original })
  }

  settle() {
    return this.completion ??= this.rollback().then(
      () => { throw this.original },
      (error: unknown) => {
        const failures = error instanceof AggregateError ? error.errors : [error]
        throw new AggregateError([this.original, ...failures], 'Vite 插件构造或资源释放失败。')
      },
    )
  }
}

/** 由配置初始化的唯一协调者等待回滚；同步工厂不启动无人等待的清理任务。 */
export function settleVitePluginConstructionFailure(error: unknown): Promise<never> | undefined {
  return error instanceof VitePluginConstructionFailure ? error.settle() : undefined
}

/** 资源创建后立即登记，正常关闭和构造回滚复用同一份有序、幂等释放表。 */
export function createVitePluginConstruction() {
  const entries: CleanupEntry[] = []
  const pending = new Set<Promise<unknown>>()
  let disposal: Promise<void> | undefined
  let constructing = true
  let accepting = true
  const add = (dispose: Cleanup, order: number, rollbackOnly: boolean) => {
    if (!constructing || disposal) {
      throw new Error('Vite 插件构造已结束，不能继续登记资源。')
    }
    entries.push({ dispose, order, rollbackOnly })
  }
  const dispose = () => {
    if (!disposal) {
      accepting = false
      disposal = Promise.allSettled([...pending]).then(async () => {
        const failures: unknown[] = []
        const remaining = entries.splice(0).sort((left, right) => left.order - right.order)
        for (const entry of remaining) {
          try {
            await entry.dispose()
          }
          catch (error) {
            failures.push(error)
          }
        }
        pending.clear()
        if (failures.length > 0) {
          throw new AggregateError(failures, 'Vite 插件资源释放失败，已继续释放其余资源。')
        }
      })
    }
    return disposal
  }
  return {
    addCleanup: (cleanup: Cleanup, order: number) => add(cleanup, order, false),
    addRollback: (cleanup: Cleanup, order: number) => add(cleanup, order, true),
    dispose,
    runTask<T>(invoke: () => T): T {
      if (!accepting) {
        throw new Error('Vite 框架服务已关闭，不再接收任务。')
      }
      const result = invoke()
      if (result && (typeof result === 'object' || typeof result === 'function') && 'then' in result) {
        const task = Promise.resolve(result)
        pending.add(task)
        void task.then(() => pending.delete(task), () => pending.delete(task))
      }
      return result
    },
    run<T>(create: () => T): T {
      try {
        const result = create()
        constructing = false
        for (let index = entries.length - 1; index >= 0; index--) {
          if (entries[index]!.rollbackOnly) {
            entries.splice(index, 1)
          }
        }
        return result
      }
      catch (error) {
        constructing = false
        throw new VitePluginConstructionFailure(error, dispose)
      }
    },
  }
}

export type VitePluginConstruction = ReturnType<typeof createVitePluginConstruction>

/** 尚未交给宿主的扩展没有钩子上下文，只能释放其工厂自身持有的资源。 */
export function registerConstructedVitePlugins(construction: VitePluginConstruction, plugins: readonly Plugin[]) {
  for (const plugin of new Set(plugins)) {
    construction.addRollback(async () => {
      const hook = plugin.closeWatcher ?? plugin.closeBundle
      const handler = typeof hook === 'function' ? hook : hook?.handler
      await handler?.call(undefined as never)
    }, viteConstructionCleanupOrder.extensions)
  }
}
