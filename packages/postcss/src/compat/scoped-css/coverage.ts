import postcss from 'postcss'
import { createComparableNodeKey, createDeclarationCoverageKey, createSelectorCoverageKey } from './signature'

function createRuleCoverageKey(rule: postcss.Rule, selector: string, declarations: string[]) {
  return JSON.stringify([createSelectorCoverageKey(rule, selector), declarations])
}

function createDeclarationKeys(rule: postcss.Rule) {
  return (rule.nodes ?? [])
    .filter((node): node is postcss.Declaration => node.type === 'decl')
    .map(createDeclarationCoverageKey)
}

export function createAtRuleCoverageKey(atRule: postcss.AtRule) {
  return createComparableNodeKey(atRule)
}

export function collectRootScopedComparableCssCoverage(cssSources: string[]) {
  const rules = new Set<string>()
  const atRules = new Set<string>()
  const declarationsBySelector = new Map<string, Set<string>>()
  const orderedDeclarationsBySelector = new Map<string, string[]>()
  const propertiesBySelector = new Map<string, Map<string, Set<string>>>()
  const normalizedRuleCss = new Set<string>()
  for (const source of cssSources) {
    try {
      const root = postcss.parse(source)
      root.walkRules((rule) => {
        normalizedRuleCss.add(createComparableNodeKey(rule))
        if (rule.nodes.some(node => node.type !== 'decl' && node.type !== 'comment')) {
          return
        }
        const declarationKeys = createDeclarationKeys(rule)
        if (declarationKeys.length === 0) {
          return
        }
        for (const selector of rule.selectors ?? [rule.selector]) {
          const normalizedSelector = createSelectorCoverageKey(rule, selector)
          rules.add(createRuleCoverageKey(rule, selector, declarationKeys))
          const selectorDeclarations = declarationsBySelector.get(normalizedSelector) ?? new Set<string>()
          for (const declaration of declarationKeys) {
            selectorDeclarations.add(declaration)
          }
          declarationsBySelector.set(normalizedSelector, selectorDeclarations)
          const ordered = orderedDeclarationsBySelector.get(normalizedSelector) ?? []
          ordered.push(...declarationKeys)
          orderedDeclarationsBySelector.set(normalizedSelector, ordered)
          const properties = propertiesBySelector.get(normalizedSelector) ?? new Map<string, Set<string>>()
          for (const node of rule.nodes) {
            if (node.type !== 'decl') {
              continue
            }
            const values = properties.get(node.prop) ?? new Set<string>()
            values.add(createDeclarationCoverageKey(node))
            properties.set(node.prop, values)
          }
          propertiesBySelector.set(normalizedSelector, properties)
        }
      })
      root.walkAtRules((atRule) => {
        atRules.add(createAtRuleCoverageKey(atRule))
      })
    }
    catch {
    }
  }
  return { rules, atRules, declarationsBySelector, orderedDeclarationsBySelector, propertiesBySelector, normalizedRuleCss }
}

export type ComparableCssCoverage = ReturnType<typeof collectRootScopedComparableCssCoverage>

export function isRuleCoveredByRootCss(rule: postcss.Rule, coverage: ReturnType<typeof collectRootScopedComparableCssCoverage>) {
  const declarationKeys = createDeclarationKeys(rule)
  if (declarationKeys.length === 0 || rule.nodes.some(node => node.type !== 'decl' && node.type !== 'comment')) {
    return false
  }
  const selectors = rule.selectors ?? [rule.selector]
  if (selectors.every(selector => coverage.rules.has(createRuleCoverageKey(rule, selector, declarationKeys)))) {
    return true
  }
  return declarationKeys.length > 0
    && selectors.every((selector) => {
      const key = createSelectorCoverageKey(rule, selector)
      const rootDeclarations = coverage.orderedDeclarationsBySelector.get(key)
      const properties = coverage.propertiesBySelector.get(key)
      if (!rootDeclarations || rule.nodes.some(node => node.type === 'decl' && properties?.get(node.prop)?.size !== 1)) {
        return false
      }
      let index = 0
      for (const declaration of rootDeclarations) {
        if (declaration === declarationKeys[index]) {
          index++
        }
      }
      return index === declarationKeys.length
    })
}
