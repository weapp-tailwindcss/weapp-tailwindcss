import postcss from 'postcss'
import { normalizeCssSignatureValue } from './predicates'

function createRuleCoverageKey(selector: string, declarations: string) {
  return `${normalizeCssSignatureValue(selector)}\0${declarations}`
}

function createDeclarationKeys(rule: postcss.Rule) {
  return (rule.nodes ?? [])
    .filter((node): node is postcss.Declaration => node.type === 'decl')
    .map(node => `${node.prop}:${normalizeCssSignatureValue(node.value)}${node.important ? '!important' : ''}`)
}

export function createAtRuleCoverageKey(atRule: postcss.AtRule) {
  return `${atRule.name}\0${normalizeCssSignatureValue(atRule.params)}\0${normalizeCssSignatureValue(atRule.toString())}`
}

export function collectRootScopedComparableCssCoverage(cssSources: string[]) {
  const rules = new Set<string>()
  const atRules = new Set<string>()
  const declarationsBySelector = new Map<string, Set<string>>()
  const normalizedRuleCss = new Set<string>()
  for (const source of cssSources) {
    try {
      const root = postcss.parse(source)
      root.walkRules((rule) => {
        normalizedRuleCss.add(normalizeCssSignatureValue(rule.toString()))
        const declarationKeys = createDeclarationKeys(rule)
        const declarations = declarationKeys.slice().sort().join(';')
        if (declarations.length === 0) {
          return
        }
        for (const selector of rule.selectors ?? [rule.selector]) {
          const normalizedSelector = normalizeCssSignatureValue(selector)
          rules.add(`${normalizedSelector}\0${declarations}`)
          const selectorDeclarations = declarationsBySelector.get(normalizedSelector) ?? new Set<string>()
          for (const declaration of declarationKeys) {
            selectorDeclarations.add(declaration)
          }
          declarationsBySelector.set(normalizedSelector, selectorDeclarations)
        }
      })
      root.walkAtRules((atRule) => {
        atRules.add(createAtRuleCoverageKey(atRule))
      })
    }
    catch {
    }
  }
  return { rules, atRules, declarationsBySelector, normalizedRuleCss }
}

export type ComparableCssCoverage = ReturnType<typeof collectRootScopedComparableCssCoverage>

export function isRuleCoveredByRootCss(rule: postcss.Rule, coverage: ReturnType<typeof collectRootScopedComparableCssCoverage>) {
  const declarationKeys = createDeclarationKeys(rule)
  const declarations = declarationKeys.slice().sort().join(';')
  if (declarations.length === 0) {
    return false
  }
  const selectors = rule.selectors ?? [rule.selector]
  if (selectors.every(selector => coverage.rules.has(createRuleCoverageKey(selector, declarations)))) {
    return true
  }
  return declarationKeys.length > 0
    && selectors.every((selector) => {
      const rootDeclarations = coverage.declarationsBySelector.get(normalizeCssSignatureValue(selector))
      return rootDeclarations != null && declarationKeys.every(declaration => rootDeclarations.has(declaration))
    })
}
