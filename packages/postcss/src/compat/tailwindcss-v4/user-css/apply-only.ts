import { postcss } from '../../../postcss-runtime'
import { createAuthorSelectorMatcher } from '../../author-selector'
import { isTailwindRuntimePropertyRule } from '../../uni-app-x-author-apply'
import { preferScopedGeneratedCssRulesRoot } from './scoped-rules'
import { collectApplyOnlySourceSelectors, isEmptyCustomVariantBlock, normalizeGeneratedSelector, removeCssComments } from './user-layers'

export function normalizeEmptyTailwindCustomVariants(css: string) {
  if (!css.includes('@custom-variant')) {
    return css
  }
  try {
    const root = postcss.parse(css)
    let changed = false
    root.walkAtRules('custom-variant', (rule) => {
      if (!isEmptyCustomVariantBlock(rule)) {
        return
      }
      rule.remove()
      changed = true
    })
    return changed ? root.toString() : css
  }
  catch {
    return css
  }
}

export function filterTailwindV4ApplyOnlyGeneratedCss(
  css: string,
  source: string,
  options: {
    preserveVariables?: boolean | undefined
    preserveRuntimeProperties?: boolean | undefined
    preferScopedRules?: boolean | undefined
  } = {},
) {
  const selectors = collectApplyOnlySourceSelectors(source)
  if (selectors.size === 0) {
    return css
  }
  const preserveVariables = options.preserveVariables !== false

  try {
    const matchesAuthorSelector = createAuthorSelectorMatcher(selectors)
    const root = postcss.parse(css)
    root.walkRules((rule) => {
      const isVariableRule = rule.nodes?.some(node => node.type === 'decl' && node.prop.startsWith('--'))
      // 变量可能被其他作者规则跨作用域引用，保留原有变量选择器覆盖范围。
      if (preserveVariables && isVariableRule) {
        return
      }
      const ruleSelectors = rule.selectors ?? [rule.selector]
      const retainedSelectors = ruleSelectors.filter(selector => matchesAuthorSelector(normalizeGeneratedSelector(selector)))
      if (retainedSelectors.length > 0) {
        if (retainedSelectors.length !== ruleSelectors.length) {
          rule.selectors = retainedSelectors
        }
        return
      }
      if (options.preserveRuntimeProperties && isTailwindRuntimePropertyRule(rule)) {
        return
      }
      rule.remove()
    })
    root.walkAtRules((rule) => {
      if (rule.nodes !== undefined && rule.nodes.length === 0) {
        rule.remove()
      }
    })
    if (options.preferScopedRules && css.includes('data-v-')) {
      preferScopedGeneratedCssRulesRoot(root)
    }
    return removeCssComments(root.toString()).trim()
  }
  catch {
    return css
  }
}
