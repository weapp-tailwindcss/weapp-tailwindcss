import type { Plugin } from 'vite'
import { createRuntimeClassSetInvalidationPlugin } from './invalidation-plugin'

interface RuntimeClassSetLifecycleOptions {
  plugins: Plugin[]
  invalidateBeforeTransform: boolean
  invalidate: () => void
  isEnabled: () => boolean
  isRelevant: (id: string) => boolean
}

/** 这里只登记来源失效；资源释放由构建实例的唯一生命周期所有者负责。 */
export function installRuntimeClassSetLifecycle(options: RuntimeClassSetLifecycleOptions) {
  if (options.invalidateBeforeTransform) {
    options.plugins.unshift(createRuntimeClassSetInvalidationPlugin(options))
  }
}
