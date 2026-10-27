import type { Plugin, ResolvedConfig } from 'vite'

interface FrameworkRuntimeLifecycleOptions {
  getResolvedConfig: () => ResolvedConfig | undefined
  dispose: () => Promise<void>
}

/** 按所有权顺序释放全部资源；某一步失败也不能跳过其余清理。 */
export async function disposeViteResources(steps: readonly (() => void | Promise<void>)[]) {
  const failures: unknown[] = []
  for (const dispose of steps) {
    try {
      await dispose()
    }
    catch (error) {
      failures.push(error)
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, 'Vite 编译实例清理失败。')
  }
}

/** 只在构建实例结束时释放状态，watch 的中间轮次与可恢复错误保留状态。 */
export function createFrameworkRuntimeLifecycle(options: FrameworkRuntimeLifecycleOptions): Plugin {
  let disposal: Promise<void> | undefined
  const dispose = () => disposal ??= Promise.resolve().then(options.dispose)
  const isPersistent = () => {
    const config = options.getResolvedConfig()
    return config?.command === 'serve' || config?.build?.watch != null
  }
  return {
    name: 'weapp-tailwindcss:runtime-lifecycle',
    enforce: 'post',
    buildEnd: {
      order: 'post',
      sequential: true,
      handler(error) {
        if (error && !isPersistent()) {
          return dispose()
        }
      },
    },
    closeBundle: {
      order: 'post',
      sequential: true,
      handler() {
        const config = options.getResolvedConfig()
        if (config?.command !== 'build' || config.build?.watch == null) {
          return dispose()
        }
      },
    },
    closeWatcher: { order: 'post', sequential: true, handler: dispose },

  }
}
