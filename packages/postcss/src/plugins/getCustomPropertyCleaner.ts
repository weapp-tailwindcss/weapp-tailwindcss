// 仅清理相邻的精确重复，不能用前置字面量推断运行时变量的取值。
import type { AcceptedPlugin, Root } from 'postcss'
import type { IStyleHandlerOptions } from '../types'

/** 仅移除相邻同属性、同值、同优先级声明，不跨越中间覆盖。 */
export function removeAdjacentDuplicateDeclarations(root: Root) {
  let changed = false
  root.walkDecls((decl) => {
    const previous = decl.prev()
    if (previous?.type === 'decl'
      && previous.prop === decl.prop
      && previous.important === decl.important
      && previous.value === decl.value) {
      decl.remove()
      changed = true
    }
  })
  return changed
}

export function getCustomPropertyCleaner(options: IStyleHandlerOptions): AcceptedPlugin | null {
  const includes = Array.isArray(options.cssCalc)
    ? options.cssCalc
    : typeof options.cssCalc === 'object'
      ? options.cssCalc.includeCustomProperties
      : undefined
  if (!includes?.length) {
    return null
  }
  return {
    postcssPlugin: 'postcss-remove-include-custom-properties',
    OnceExit(root) {
      removeAdjacentDuplicateDeclarations(root)
    },
  }
}
