import { postcss } from '../postcss-runtime'
import { isCssRuleCoveredByDeclarations, removeEmptyAtRules } from './coverage'
import { collectCssRuleContentKeys, collectCssRuleDeclarationKeyMap, collectNormalizedCssNodes, getCssRuleContentKey, normalizeCssForContainment } from './structure'

function filterCssRules(base: ReturnType<typeof prepareCssBase>, css: string) {
  const baseRuleKeys = base.ruleKeys()
  if (baseRuleKeys.size === 0) {
    return css
  }
  try {
    const root = postcss.parse(css)
    const baseRuleDeclarationKeys = base.declarations()
    let changed = false
    root.walkRules((rule) => {
      const key = getCssRuleContentKey(rule)
      if (
        (key && baseRuleKeys.has(key))
        || isCssRuleCoveredByDeclarations(rule, baseRuleDeclarationKeys)
      ) {
        rule.remove()
        changed = true
      }
    })
    if (!changed) {
      return css
    }
    removeEmptyAtRules(root)
    return root.toString().trim()
  }
  catch {
    return css
  }
}

function containsCss(base: ReturnType<typeof prepareCssBase>, css: string) {
  if (base.css.includes(css)) {
    return true
  }
  const normalizedBaseCss = base.normalized()
  const normalizedCss = normalizeCssForContainment(css)
  if (normalizedCss.length > 0 && normalizedBaseCss.includes(normalizedCss)) {
    return true
  }
  const normalizedNodes = collectNormalizedCssNodes(css)
  if (normalizedNodes.length > 0 && normalizedNodes.every(node => normalizedBaseCss.includes(node))) {
    return true
  }
  const ruleKeys = collectCssRuleContentKeys(css, normalizedBaseCss)
  return ruleKeys.size > 0
    && [...ruleKeys].every(key => base.ruleKeys().has(key))
}

function prepareCssBase(css: string) {
  let normalized: string | undefined
  let ruleKeys: Set<string> | undefined
  let declarations: Map<string, Set<string>> | undefined
  let root: postcss.Root | null | undefined
  const parsedRoot = () => {
    if (root === undefined) {
      try {
        root = postcss.parse(css)
      }
      catch {
        root = null
      }
    }
    return root
  }
  return {
    css,
    normalized: () => normalized ??= normalizeCssForContainment(css),
    ruleKeys: () => {
      if (!ruleKeys) {
        const parsed = parsedRoot()
        ruleKeys = parsed ? collectCssRuleContentKeys(parsed) : new Set()
        if (declarations) {
          root = null
        }
      }
      return ruleKeys
    },
    declarations: () => {
      if (!declarations) {
        const parsed = parsedRoot()
        declarations = parsed ? collectCssRuleDeclarationKeyMap(parsed) : new Map()
        // 两个索引就绪后释放 AST，避免 matcher 长期保留整棵语法树。
        if (ruleKeys) {
          root = null
        }
      }
      return declarations
    },
  }
}

/** 对同一份不可变主样式复用比较索引；调用方在主样式更新后创建新的 matcher。 */
export function createCssRuleMatcher(baseCss: string) {
  const base = prepareCssBase(baseCss)
  return {
    contains: (css: string) => containsCss(base, css),
    filter: (css: string) => filterCssRules(base, css),
  }
}

export function filterExistingCssRules(baseCss: string, css: string) {
  return filterCssRules(prepareCssBase(baseCss), css)
}

export function containsCssAfterMinify(baseCss: string, css: string) {
  return containsCss(prepareCssBase(baseCss), css)
}
