import type { Root } from 'postcss'
import { postcss } from '../postcss-runtime'

export function normalizeGeneratedSelector(selector: string) {
  return selector.replace(/:not\(#\\#\)/g, '').trim()
}

/** 复用调用方 AST，同时取得 apply 选择器和纯 apply 输入判定。 */
export function analyzeApplyOnlySourceRoot(root: Root) {
  const selectors = new Set<string>()
  let hasApplyRule = false
  let hasNonApplyRule = false
  root.walkRules((rule) => {
    if (!rule.nodes?.some(node => node.type === 'atrule' && node.name === 'apply')) {
      hasNonApplyRule = true
      return
    }
    hasApplyRule = true
    for (const selector of rule.selectors ?? [rule.selector]) {
      const normalized = normalizeGeneratedSelector(selector)
      if (normalized) {
        selectors.add(normalized)
      }
    }
  })
  return { selectors, onlyApply: hasApplyRule && !hasNonApplyRule }
}

export function analyzeApplyOnlySource(source: string) {
  try {
    return analyzeApplyOnlySourceRoot(postcss.parse(source))
  }
  catch {
    return { selectors: new Set<string>(), onlyApply: false }
  }
}
