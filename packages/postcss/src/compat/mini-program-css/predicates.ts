import type postcss from 'postcss'
import { getRuleSelectors, isMiniProgramPreflightSelector, isMiniProgramThemeScopeSelector } from './selectors'

export const PREFLIGHT_RESET_PROPS = new Set([
  'box-sizing',
  'border',
  'border-width',
  'border-style',
  'border-color',
  'margin',
  'padding',
])

const PSEUDO_CONTENT_SELECTOR_RE = /^(?:::before|::after|:before|:after)(?:,(?:::before|::after|:before|:after))*$/
const TW_CONTENT_VAR_RE = /var\(\s*--tw-content\b/
const BROWSER_PREFLIGHT_SINGLE_ELEMENT_DECLARATIONS = new Map<string, Set<string>>([
  ['button', new Set([
    'appearance:button',
    '-moz-appearance:button',
  ])],
  ['textarea', new Set([
    'resize:vertical',
  ])],
])

export function hasTailwindPreflightDeclaration(rule: postcss.Rule) {
  let hasTailwindVar = false
  let hasResetProp = false

  rule.walkDecls((decl) => {
    if (decl.prop.startsWith('--tw-')) {
      hasTailwindVar = true
    }
    if (PREFLIGHT_RESET_PROPS.has(decl.prop)) {
      hasResetProp = true
    }
  })

  return hasTailwindVar || hasResetProp
}

function hasTailwindVariableDeclaration(rule: postcss.Rule) {
  let hasTailwindVar = false
  rule.walkDecls((decl) => {
    if (decl.prop.startsWith('--tw-')) {
      hasTailwindVar = true
    }
  })
  return hasTailwindVar
}

export function hasTwContentDeclaration(rule: postcss.Rule) {
  let hasContentInit = false
  rule.walkDecls('--tw-content', () => {
    hasContentInit = true
  })
  return hasContentInit
}

export function isCustomPropertyRule(rule: postcss.Rule) {
  let hasDeclaration = false
  let allCustomProperties = true

  rule.each((node) => {
    if (node.type !== 'decl') {
      return
    }
    hasDeclaration = true
    if (!node.prop.startsWith('--')) {
      allCustomProperties = false
    }
  })

  return hasDeclaration && allCustomProperties
}

export function isEmptyTwContentDeclaration(decl: postcss.Declaration) {
  return decl.prop === '--tw-content' && (decl.value === '""' || decl.value === '\'\'')
}

function isOnlyTwContentDeclarations(rule: postcss.Rule) {
  let hasDeclaration = false
  let onlyContentVariable = true
  rule.walkDecls((decl) => {
    hasDeclaration = true
    if (decl.prop !== '--tw-content') {
      onlyContentVariable = false
    }
  })

  return hasDeclaration && onlyContentVariable
}

export function isPseudoContentInitRule(rule: postcss.Rule) {
  const selector = rule.selector.replace(/\s+/g, '')
  return PSEUDO_CONTENT_SELECTOR_RE.test(selector) && isOnlyTwContentDeclarations(rule)
}

export function usesTwContentVariable(root: postcss.Root) {
  let used = false
  root.walkDecls((decl) => {
    if (TW_CONTENT_VAR_RE.test(decl.value)) {
      used = true
    }
  })
  return used
}

export function isMiniProgramPreflightRule(node: postcss.AnyNode): boolean {
  if (node.type !== 'rule') {
    return false
  }
  const selectors = getRuleSelectors(node)
  if (!isMiniProgramPreflightSelector(selectors)) {
    return false
  }
  if (selectors.includes('*')) {
    return hasTailwindPreflightDeclaration(node)
  }
  if (hasTailwindVariableDeclaration(node)) {
    return true
  }
  return selectors.some(selector => selector === ':before' || selector === ':after' || selector === '::before' || selector === '::after')
    && selectors.some(selector => selector === 'view' || selector === 'text')
    && hasTailwindPreflightDeclaration(node)
}

export function isBrowserElementPreflightRule(node: postcss.AnyNode): boolean {
  if (node.type !== 'rule') {
    return false
  }

  const selectors = getRuleSelectors(node)
  const selector = selectors[0]
  if (selectors.length !== 1 || selector === undefined) {
    return false
  }

  const declarations = BROWSER_PREFLIGHT_SINGLE_ELEMENT_DECLARATIONS.get(selector)
  if (!declarations) {
    return false
  }

  let hasDeclaration = false
  let allBrowserPreflightDeclarations = true
  node.each((child) => {
    if (child.type !== 'decl') {
      return
    }
    hasDeclaration = true
    const key = `${child.prop.toLowerCase()}:${child.value.trim().toLowerCase()}`
    if (!declarations.has(key)) {
      allBrowserPreflightDeclarations = false
    }
  })

  return hasDeclaration && allBrowserPreflightDeclarations
}

export function isMiniProgramThemeVariableRule(node: postcss.AnyNode): boolean {
  if (node.type !== 'rule') {
    return false
  }
  return isMiniProgramThemeScopeSelector(getRuleSelectors(node)) && isCustomPropertyRule(node)
}
