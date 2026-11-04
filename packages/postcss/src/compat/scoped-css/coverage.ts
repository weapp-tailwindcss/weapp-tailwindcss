import type { CoverageSignatures } from './signature'
import postcss from 'postcss'
import { createCoverageSignatures } from './signature'

function createRuleCoverageKey(selector: string, declarations: string[]) {
  return JSON.stringify([selector, declarations])
}

function createDeclarationKeys(rule: postcss.Rule, signatures: CoverageSignatures) {
  return (rule.nodes ?? [])
    .filter((node): node is postcss.Declaration => node.type === 'decl')
    .map(signatures.declaration)
}

export function collectRootScopedComparableCssCoverage(cssSources: string[]) {
  const signatures = createCoverageSignatures()
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
        normalizedRuleCss.add(signatures.node(rule))
        if (rule.nodes.some(node => node.type !== 'decl' && node.type !== 'comment')) {
          return
        }
        const declarations = rule.nodes.filter((node): node is postcss.Declaration => node.type === 'decl')
        const declarationKeys = declarations.map(signatures.declaration)
        if (declarationKeys.length === 0) {
          return
        }
        for (const selector of rule.selectors ?? [rule.selector]) {
          const normalizedSelector = signatures.selector(rule, selector)
          rules.add(createRuleCoverageKey(normalizedSelector, declarationKeys))
          const selectorDeclarations = declarationsBySelector.get(normalizedSelector) ?? new Set<string>()
          for (const declaration of declarationKeys) {
            selectorDeclarations.add(declaration)
          }
          declarationsBySelector.set(normalizedSelector, selectorDeclarations)
          const ordered = orderedDeclarationsBySelector.get(normalizedSelector) ?? []
          ordered.push(...declarationKeys)
          orderedDeclarationsBySelector.set(normalizedSelector, ordered)
          const properties = propertiesBySelector.get(normalizedSelector) ?? new Map<string, Set<string>>()
          for (const [index, node] of declarations.entries()) {
            const values = properties.get(node.prop) ?? new Set<string>()
            values.add(declarationKeys[index]!)
            properties.set(node.prop, values)
          }
          propertiesBySelector.set(normalizedSelector, properties)
        }
      })
      root.walkAtRules((atRule) => {
        atRules.add(signatures.node(atRule))
      })
    }
    catch {
    }
  }
  return { rules, atRules, declarationsBySelector, orderedDeclarationsBySelector, propertiesBySelector, normalizedRuleCss }
}

export type ComparableCssCoverage = ReturnType<typeof collectRootScopedComparableCssCoverage>

export function isRuleCoveredByRootCss(rule: postcss.Rule, coverage: ReturnType<typeof collectRootScopedComparableCssCoverage>, signatures = createCoverageSignatures()) {
  if (coverage.rules.size === 0 && coverage.orderedDeclarationsBySelector.size === 0) {
    return false
  }
  const declarationKeys = createDeclarationKeys(rule, signatures)
  if (declarationKeys.length === 0 || rule.nodes.some(node => node.type !== 'decl' && node.type !== 'comment')) {
    return false
  }
  const selectors = rule.selectors ?? [rule.selector]
  if (selectors.every(selector => coverage.rules.has(createRuleCoverageKey(signatures.selector(rule, selector), declarationKeys)))) {
    return true
  }
  return declarationKeys.length > 0
    && selectors.every((selector) => {
      const key = signatures.selector(rule, selector)
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
