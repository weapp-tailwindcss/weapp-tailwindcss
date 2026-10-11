import type { Plugin, ResolvedConfig } from 'vite'

interface FrameworkRuntimeLifecycleOptions {
  getResolvedConfig: () => ResolvedConfig | undefined
  dispose: () => Promise<void>
}

/** 只在构建实例结束时释放状态，watch 每轮 closeBundle 保留增量数据。 */
export function createFrameworkRuntimeLifecycle(options: FrameworkRuntimeLifecycleOptions): Plugin {
  let disposal: Promise<void> | undefined
  const dispose = () => disposal ??= options.dispose()
  return {
    name: 'weapp-tailwindcss:runtime-lifecycle',
    closeBundle() {
      if (options.getResolvedConfig()?.build.watch == null) {
        return dispose()
      }
    },
    closeWatcher: dispose,
    configureServer(server) {
      server.httpServer?.once('close', () => {
        void dispose().catch(error => server.config.logger.error(String(error)))
      })
    },
  }
}
