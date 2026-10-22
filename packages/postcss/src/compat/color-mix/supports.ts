import type { Root } from 'postcss'
import valueParser from 'postcss-value-parser'
import { getCssCustomPropertyName } from '../../utils/css-custom-property'
import { tryResolveColorMix } from './resolve'

const STATIC_COLOR_MIX_SUPPORTS_RE = /^\(\s*color\s*:\s*color-mix\(\s*in\s+lab\s*,\s*red\s*,\s*red\s*\)\s*\)$/i

/** 仅降低编译器的单一 mix 能力分支；完整依赖分析必须在此之前完成。 */
export function lowerStaticColorMixSupports(root: Root, customPropertyValues: ReadonlyMap<string, string>) {
  let changed = false
  root.walkAtRules('supports', (rule) => {
    if (rule.parent?.type !== 'rule' || !STATIC_COLOR_MIX_SUPPORTS_RE.test(rule.params)) {
      return
    }
    let ancestor = rule.parent.parent
    while (ancestor && ancestor.type !== 'root') {
      // 只在普通样式、媒体和级联层中降低，不能把无效 keyframe 子树变成有效声明。
      if (ancestor.type !== 'rule' && (ancestor.type !== 'atrule' || !['layer', 'media'].includes(ancestor.name.toLowerCase()))) {
        return
      }
      ancestor = ancestor.parent
    }
    const declarations = rule.nodes?.filter(node => node.type !== 'comment') ?? []
    if (declarations.length === 0) {
      return
    }
    const replacements = []
    for (const declaration of rule.nodes ?? []) {
      if (declaration.type === 'comment') {
        replacements.push(declaration.clone())
        continue
      }
      if (declaration.type !== 'decl' || getCssCustomPropertyName(declaration.prop)) {
        return
      }
      const nodes = valueParser(declaration.value).nodes.filter(node => node.type !== 'space' && node.type !== 'comment')
      const node = nodes.length === 1 ? nodes[0] : undefined
      if (node?.type !== 'function' || node.value.toLowerCase() !== 'color-mix') {
        return
      }
      const resolved = tryResolveColorMix(node, customPropertyValues)
      if (!resolved) {
        return
      }
      replacements.push(declaration.clone({ value: resolved.value }))
    }
    rule.replaceWith(...replacements)
    changed = true
  })
  return changed
}
