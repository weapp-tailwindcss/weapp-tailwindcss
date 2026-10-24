import type { Plugin } from 'vite'
import type { FrameworkAssetAccess } from './framework-assets'
import { createFrameworkAssetAccess } from './framework-assets'

/** 框架产物插件只取得受限操作，原始 bundle 由构建器适配层持有。 */
export function createFrameworkAssetPlugin(options: {
  name: string
  enforce?: 'pre' | 'post'
  generateBundle: (assets: FrameworkAssetAccess) => void | Promise<void>
}): Plugin {
  return {
    name: options.name,
    ...(options.enforce ? { enforce: options.enforce } : {}),
    generateBundle(_outputOptions, bundle) {
      return options.generateBundle(createFrameworkAssetAccess(bundle))
    },
  }
}
