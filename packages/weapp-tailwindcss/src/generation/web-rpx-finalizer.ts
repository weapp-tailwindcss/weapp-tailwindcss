import type { postcss } from '@weapp-tailwindcss/postcss/transform'
import { normalizeTailwindcssWebRpxDeclarations } from '@weapp-tailwindcss/postcss/transform'

const pluginName = 'weapp-tailwindcss:web-rpx-finalizer'
const marker = Symbol.for('weapp-tailwindcss.web-rpx-finalizer')

/** 在真实框架转换后兜底，不重放显式单位转换。 */
export function createWebRpxFinalizerPlugin(): postcss.Plugin {
  return Object.assign({
    postcssPlugin: pluginName,
    OnceExit(root: postcss.Root) {
      normalizeTailwindcssWebRpxDeclarations(root, { majorVersion: 4 })
    },
  }, { [marker]: true })
}

export function hasWebRpxFinalizerPlugin(plugins: unknown) {
  return Array.isArray(plugins) && plugins.some(plugin => typeof plugin === 'object' && plugin !== null && plugin[marker] === true)
}
