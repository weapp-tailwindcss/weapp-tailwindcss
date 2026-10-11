import type { Plugin } from 'vite'

/** 在框架的前置 SFC HMR 转换之前标记变更，刷新由下一次集合读取合并执行。 */
export function createRuntimeClassSetInvalidationPlugin(options: {
  invalidate: () => void
  isEnabled: () => boolean
  isRelevant: (id: string) => boolean
}): Plugin {
  const invalidate = (id: string) => {
    if (options.isEnabled() && options.isRelevant(id)) {
      options.invalidate()
    }
  }
  return {
    name: 'weapp-tailwindcss:runtime-invalidation',
    enforce: 'pre',
    watchChange: invalidate,
    handleHotUpdate: {
      order: 'pre',
      handler(ctx) {
        invalidate(ctx.file)
      },
    },
  }
}
