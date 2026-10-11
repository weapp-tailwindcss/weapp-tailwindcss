import type { Plugin, ResolvedConfig } from 'vite'
import { createRuntimeClassSetInvalidationPlugin } from './invalidation-plugin'

interface RuntimeClassSetLifecycleOptions {
  plugins: Plugin[]
  uniAppX: boolean
  invalidate: () => void
  isEnabled: () => boolean
  isRelevant: (id: string) => boolean
  dispose: () => void
  getResolvedConfig: () => ResolvedConfig | undefined
}

/** 将失效通知放在框架前置钩子之前，释放钩子放在框架插件之后。 */
export function installRuntimeClassSetLifecycle(options: RuntimeClassSetLifecycleOptions) {
  if (options.uniAppX) {
    options.plugins.unshift(createRuntimeClassSetInvalidationPlugin(options))
  }
  options.plugins.push({
    name: 'weapp-tailwindcss:runtime-dispose',
    closeWatcher: options.dispose,
    closeBundle() {
      const config = options.getResolvedConfig()
      if (!config?.build?.watch && config?.command !== 'serve') {
        options.dispose()
      }
    },
    configureServer(server) {
      server.httpServer?.once('close', options.dispose)
    },
  })
}
