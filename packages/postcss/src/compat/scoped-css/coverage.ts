import type { CoverageSignatures } from './signature'
import postcss from 'postcss'
import { createCoverageSignatures } from './signature'

const coverageSignatures = new WeakMap<ComparableCssCoverage, CoverageSignatures>()

export interface ComparableCssCoverage {
  rules: Set<string>
  atRules: Set<string>
  declarationsBySelector: Map<string, Set<string>>
  orderedDeclarationsBySelector: Map<string, string[]>
  propertiesBySelector: Map<string, Map<string, Set<string>>>
  normalizedRuleCss: Set<string>
}

/** 覆盖索引只保留根值；每次目标清理取得独立上下文，不缓存目标 AST 或新值。 */
export function createRootCssCoverageSignatures(coverage: ComparableCssCoverage) {
  return coverageSignatures.get(coverage)?.fork() ?? createCoverageSignatures()
}

function createRuleCoverageKey(selector: string, declarations: string[]) {
  return JSON.stringify([selector, declarations])
}

function createDeclarationKeys(rule: postcss.Rule, signatures: CoverageSignatures) {
  return (rule.nodes ?? [])
    .filter((node): node is postcss.Declaration => node.type === 'decl')
    .map(signatures.declaration)
}

function collectCompleteCssCoverage(cssSources: string[], signatures: CoverageSignatures, preparedRules?: Set<string>): ComparableCssCoverage {
  const rules = new Set<string>()
  const atRules = new Set<string>()
  const declarationsBySelector = new Map<string, Set<string>>()
  const orderedDeclarationsBySelector = new Map<string, string[]>()
  const propertiesBySelector = new Map<string, Map<string, Set<string>>>()
  const normalizedRuleCss = preparedRules ?? new Set<string>()
  for (const source of cssSources) {
    try {
      const root = postcss.parse(source)
      root.walkRules((rule) => {
        if (!preparedRules) {
          normalizedRuleCss.add(signatures.node(rule))
        }
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

/** 整条规则比较无需预建声明索引；后续需要部分覆盖证明时仍按原始输入补齐。 */
export function collectRootScopedComparableCssCoverage(cssSources: string[], options?: { exactOnly?: boolean }): ComparableCssCoverage {
  const signatures = createCoverageSignatures()
  let coverage: ComparableCssCoverage
  if (options?.exactOnly) {
    let sources: string[] | undefined = cssSources.slice()
    const normalizedRuleCss = new Set<string>()
    for (const source of sources) {
      try {
        postcss.parse(source).walkRules((rule) => {
          normalizedRuleCss.add(signatures.node(rule))
        })
      }
      catch {}
    }
    let complete: ComparableCssCoverage | undefined
    const readComplete = () => {
      if (!complete) {
        complete = collectCompleteCssCoverage(sources!, signatures, normalizedRuleCss)
        sources = undefined
      }
      return complete
    }
    coverage = {
      get rules() { return readComplete().rules },
      get atRules() { return readComplete().atRules },
      get declarationsBySelector() { return readComplete().declarationsBySelector },
      get orderedDeclarationsBySelector() { return readComplete().orderedDeclarationsBySelector },
      get propertiesBySelector() { return readComplete().propertiesBySelector },
      normalizedRuleCss,
    }
  }
  else {
    coverage = collectCompleteCssCoverage(cssSources, signatures)
  }
  coverageSignatures.set(coverage, signatures)
  return coverage
}

export function isRuleCoveredByRootCss(rule: postcss.Rule, coverage: ReturnType<typeof collectRootScopedComparableCssCoverage>, signatures = createRootCssCoverageSignatures(coverage)) {
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
