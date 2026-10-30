import type { CssPreflightOptions, CssSelectorReplacement } from '../../types'
import postcss from 'postcss'
import { isSkylineTypographyResetRule, retainSkylineTypographyResets } from '../tailwindcss-v4/skyline-typography'
import {
  isEmptyTwContentDeclaration,
  isMiniProgramPreflightRule,
} from './predicates'
import {
  getRuleSelectors,
  MINI_PROGRAM_ELEMENT_SCOPE_SELECTOR,
  MINI_PROGRAM_ELEMENT_SCOPE_SELECTORS,
} from './selectors'

const MINI_PROGRAM_PSEUDO_CONTENT_SELECTORS = new Set(['::before', '::after'])

function applyConfiguredPreflightDeclarations(
  rule: postcss.Rule,
  cssPreflight: CssPreflightOptions | undefined,
) {
  if (!cssPreflight || typeof cssPreflight !== 'object') {
    return
  }

  const configuredNodes: postcss.Declaration[] = []
  const remainingNodes: postcss.ChildNode[] = []
  const remainingDeclarations = new Map<string, postcss.Declaration>()
  for (const node of rule.nodes ?? []) {
    if (node.type !== 'decl') {
      remainingNodes.push(node)
      continue
    }
    if (Object.hasOwn(cssPreflight, node.prop)) {
      remainingDeclarations.set(node.prop, node)
      continue
    }
    remainingNodes.push(node)
  }

  for (const [prop, value] of Object.entries(cssPreflight)) {
    if (value === false) {
      continue
    }
    const declaration = remainingDeclarations.get(prop)?.clone() ?? postcss.decl({ prop, value: value.toString() })
    declaration.value = value.toString()
    configuredNodes.push(declaration)
  }

  rule.removeAll()
  rule.append([...configuredNodes, ...remainingNodes])
}

export function collectPreflightRules(root: postcss.Root, options: { cssPreflight?: CssPreflightOptions | undefined, cssSelectorReplacement?: CssSelectorReplacement | undefined, preserveSkylineTypography?: boolean } = {}) {
  const preflightNodes: postcss.Rule[] = []

  for (const node of root.nodes ?? []) {
    if (node.type === 'rule' && options.preserveSkylineTypography && isSkylineTypographyResetRule(node)) {
      continue
    }
    if (isMiniProgramPreflightRule(node)) {
      preflightNodes.push(node)
    }
  }

  if (preflightNodes.length === 0) {
    return []
  }

  const clonedPreflightRules = preflightNodes.map((node) => {
    const rule = node.clone()
    rule.walkDecls('--tw-content', (decl) => {
      if (isEmptyTwContentDeclaration(decl)) {
        decl.remove()
      }
    })
    return rule
  })
  for (const rule of clonedPreflightRules) {
    const selectors = getRuleSelectors(rule)
    const hasElementSelector = selectors.some(selector => selector === 'view' || selector === 'text')
    const isPseudoContentScope = selectors.length > 0
      && selectors.every(selector => MINI_PROGRAM_PSEUDO_CONTENT_SELECTORS.has(selector))
    if (isPseudoContentScope) {
      rule.remove()
    }
    else if (hasElementSelector && selectors.every(selector => MINI_PROGRAM_ELEMENT_SCOPE_SELECTORS.has(selector))) {
      if (options.cssPreflight === false) {
        if (!options.preserveSkylineTypography || !retainSkylineTypographyResets(rule)) {
          rule.removeAll()
        }
        continue
      }
      rule.selector = MINI_PROGRAM_ELEMENT_SCOPE_SELECTOR
      applyConfiguredPreflightDeclarations(rule, options.cssPreflight)
    }
  }
  const nonEmptyPreflightRules = [
    ...clonedPreflightRules.filter(rule => (rule.nodes?.length ?? 0) > 0),
  ]
  for (const node of preflightNodes) {
    node.remove()
  }

  return nonEmptyPreflightRules
}

export function createPreflightResetRule(cssPreflight: CssPreflightOptions | undefined) {
  if (!cssPreflight || typeof cssPreflight !== 'object') {
    return
  }

  const rule = postcss.rule({
    selector: MINI_PROGRAM_ELEMENT_SCOPE_SELECTOR,
  })
  for (const [prop, value] of Object.entries(cssPreflight)) {
    if (value === false) {
      continue
    }
    rule.append({
      prop,
      value: value.toString(),
    })
  }
  return rule.nodes?.length ? rule : undefined
}
