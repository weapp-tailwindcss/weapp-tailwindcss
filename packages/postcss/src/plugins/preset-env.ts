import type { Declaration, Plugin } from 'postcss'
import postcss from 'postcss'
import postcssPresetEnv from 'postcss-preset-env'
import { preserveTailwindRuntimeVariables } from './preset-env/runtime-variables'

function isolateDeclaration(declaration: Declaration) {
  const parent = declaration.parent
  const container = parent?.type === 'atrule'
    ? postcss.atRule({ name: parent.name, params: parent.params })
    : parent?.type === 'rule'
      ? postcss.rule({ selector: parent.selector })
      : postcss.root()
  container.append(declaration.clone())
  return container
}

function preserveIndependentHexAlphaFallback(plugin: Plugin): Plugin {
  const transform = plugin.Declaration
  if (typeof transform !== 'function') {
    return plugin
  }

  return {
    ...plugin,
    prepare(result) {
      const prepared = plugin.prepare?.(result)
      const visited = new WeakMap<Declaration, string>()
      return {
        ...prepared,
        Declaration(declaration, helpers) {
          if (!/#[\da-f]{4}(?:[\da-f]{4})?\b/i.test(declaration.value)
            || visited.get(declaration.proxyOf) === declaration.value) {
            return
          }
          visited.set(declaration.proxyOf, declaration.value)

          // 前面的同名属性可能是厂商前缀或动态变量，不能代表本声明已有兼容回退。
          // 复用已按浏览器和 feature 配置选中的转换器，仅隔离相邻声明的影响。
          const isolated = isolateDeclaration(declaration)
          const apply = () => {
            const nodes = isolated.nodes ?? []
            if (nodes.length === 1 && nodes[0]?.type === 'decl' && nodes[0].value === declaration.value) {
              return
            }
            const previous = declaration.prev()
            const fallback = nodes[0]
            const sameProperty = previous?.type === 'decl' && fallback?.type === 'decl'
              && (fallback.prop.startsWith('--')
                ? previous.prop === fallback.prop
                : previous.prop.toLowerCase() === fallback.prop.toLowerCase())
            // preserve:true 的已有精确回退无需重复插入，不能跨过作者的中间覆盖。
            if (nodes.length === 2 && previous?.type === 'decl' && fallback?.type === 'decl'
              && sameProperty
              && previous.value === fallback.value && Boolean(previous.important) === Boolean(fallback.important)) {
              return
            }
            for (const node of nodes) {
              if (node.type === 'decl') {
                visited.set(node.proxyOf, node.value)
              }
            }
            declaration.replaceWith(...nodes)
          }
          const result = transform(isolated.first as Declaration, helpers)
          return result ? Promise.resolve(result).then(apply) : apply()
        },
      }
    },
  }
}

export function createPresetEnvPlugin(options: Parameters<typeof postcssPresetEnv>[0], preserveRuntimeVariables = false) {
  const preset = postcssPresetEnv(options)
  preset.plugins = preset.plugins.map((plugin) => {
    if (preserveRuntimeVariables && typeof plugin === 'object' && 'postcssPlugin' in plugin && plugin.postcssPlugin === 'postcss-custom-properties') {
      return preserveTailwindRuntimeVariables(plugin)
    }
    return typeof plugin === 'object' && 'postcssPlugin' in plugin && plugin.postcssPlugin === 'postcss-color-hex-alpha'
      ? preserveIndependentHexAlphaFallback(plugin)
      : plugin
  })
  return preset
}
