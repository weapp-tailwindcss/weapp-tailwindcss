import postcss from 'postcss'
import { parseUniAppXStyleSource } from '../../syntax/index'

/** 每份生成结果建立一次索引，仅在命中作者规则时克隆声明。 */
export function createUniAppXHarmonyApplyCssExpander(generatedCss: string) {
  const rules = new Map<string, postcss.ChildNode[]>()
  try {
    postcss.parse(generatedCss).walkRules((rule) => {
      if (rule.nodes && rule.nodes.length > 0) {
        rules.set(rule.selector.trim(), rule.nodes)
      }
    })
  }
  catch {
    return
  }
  if (rules.size === 0) {
    return
  }
  return (styleSource: string): string => {
    if (!styleSource.includes('@apply')) {
      return styleSource
    }
    let root: postcss.Root
    try {
      root = parseUniAppXStyleSource(styleSource)
    }
    catch {
      return styleSource
    }
    let changed = false
    root.walkRules((rule) => {
      const hasApply = rule.nodes?.some(node => node.type === 'atrule' && node.name === 'apply') === true
      if (!hasApply) {
        return
      }
      const generatedNodes = rules.get(rule.selector.trim())
      if (!generatedNodes) {
        return
      }
      rule.removeAll()
      rule.append(generatedNodes.map(node => node.clone()))
      changed = true
    })
    if (!changed) {
      return styleSource
    }
    const css = root.toString()
    if (css.includes('@apply') || !css.includes('@reference')) {
      return css
    }
    root.walkAtRules('reference', rule => rule.remove())
    return root.toString()
  }
}
