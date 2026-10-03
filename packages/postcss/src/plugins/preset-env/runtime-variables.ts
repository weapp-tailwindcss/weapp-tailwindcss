import type { Plugin, Root } from 'postcss'
import { getCssCalcVariableReferences, getCssCustomPropertyName } from '../../utils/css-custom-property'

function collectRuntimeDependencies(root: Root) {
  const dependents = new Map<string, Set<string>>()
  const runtime = new Set<string>()
  root.walkDecls((decl) => {
    const property = getCssCustomPropertyName(decl.prop)
    if (!property) {
      return
    }
    if (property.startsWith('--tw-')) {
      runtime.add(property)
    }
    for (const name of getCssCalcVariableReferences(decl.value).values()) {
      const names = dependents.get(name) ?? new Set<string>()
      names.add(property)
      dependents.set(name, names)
      if (name.startsWith('--tw-')) {
        runtime.add(name)
      }
    }
  })
  // 条件或局部声明也可能把主题别名连接到运行时状态，不能按根默认值冻结。
  const pending = [...runtime]
  for (let index = 0; index < pending.length; index++) {
    for (const name of dependents.get(pending[index]!) ?? []) {
      if (!runtime.has(name)) {
        runtime.add(name)
        pending.push(name)
      }
    }
  }
  return runtime
}

/** 仅限制变量静态化插件，保留其他平台转换对同一声明的处理。 */
export function preserveTailwindRuntimeVariables(plugin: Plugin): Plugin {
  return {
    ...plugin,
    prepare(result) {
      const prepared = plugin.prepare?.(result)
      const transform = prepared?.Declaration ?? plugin.Declaration
      if (typeof transform !== 'function') {
        return prepared ?? {}
      }
      let runtime = new Set<string>()
      const once = prepared?.Once ?? plugin.Once
      return {
        ...prepared,
        Once(root, helpers) {
          // handler 已完成作者插件阶段，此图仅属于本次平台处理的输入。
          runtime = collectRuntimeDependencies(root)
          return once?.(root, helpers)
        },
        Declaration(decl, helpers) {
          if ([...getCssCalcVariableReferences(decl.value).values()].some(name => name.startsWith('--tw-') || runtime.has(name))) {
            return
          }
          return transform(decl, helpers)
        },
      }
    },
  }
}
