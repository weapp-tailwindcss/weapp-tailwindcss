import type { AtRule, Declaration, Rule } from 'postcss'

const VUE_SCOPED_ATTR_RE = /\[data-v-[^\]]+\]/gi
const VUE_SCOPED_CLASS_RE = /\.data-v-[\w-]+/gi
const SCOPED_UNIVERSAL_PREFLIGHT_SELECTORS = new Set(['*', ':after', ':before', '::after', '::before', '::backdrop', '::file-selector-button'])
const MINI_PROGRAM_PREFLIGHT_SELECTORS = new Set(['view', 'text', '::after', '::before'])
const UNI_APP_WEB_PREFLIGHT_SELECTORS = new Set(['uni-view', 'uni-text', ':after', ':before', '::after', '::before'])
const MINI_PROGRAM_PREFLIGHT_DECLARATIONS = new Set(['box-sizing', 'margin', 'padding', 'border'])
const TAILWIND_PREFLIGHT_DECLARATIONS = new Set([
  '-moz-tab-size:4',
  '-webkit-appearance:none',
  '-webkit-appearance:button',
  '-webkit-tap-highlight-color:transparent',
  '-webkit-text-decoration:inherit',
  '-webkit-text-decoration:underline dotted',
  '-webkit-text-size-adjust:100%',
  '-o-tab-size:4',
  'appearance:button',
  'background-color:transparent',
  'border-collapse:collapse',
  'border-color:inherit',
  'border-radius:0',
  'border-top-width:1px',
  'bottom:-.25em',
  'color:inherit',
  'display:block',
  'display:inline-flex',
  'display:list-item',
  'font:inherit',
  'font-family:inherit',
  'font-feature-settings:inherit',
  'font-size:1em',
  'font-size:75%',
  'font-size:80%',
  'font-size:inherit',
  'font-variation-settings:inherit',
  'font-weight:bolder',
  'font-weight:inherit',
  'height:0',
  'height:auto',
  'letter-spacing:inherit',
  'line-height:1',
  'line-height:1.5',
  'line-height:0',
  'line-height:inherit',
  'list-style:none',
  'margin-inline-end:4px',
  'max-width:100%',
  'min-height:1lh',
  'opacity:1',
  'outline:auto',
  'padding:0',
  'padding-block:0',
  'position:relative',
  'resize:vertical',
  'tab-size:4',
  'text-align:inherit',
  'text-decoration:inherit',
  'text-decoration:underline dotted',
  'text-indent:0',
  'text-transform:none',
  'top:-.5em',
  'vertical-align:baseline',
  'vertical-align:middle',
])

export function hasVueScopedAttr(value: string) {
  VUE_SCOPED_ATTR_RE.lastIndex = 0
  VUE_SCOPED_CLASS_RE.lastIndex = 0
  const matched = VUE_SCOPED_ATTR_RE.test(value) || VUE_SCOPED_CLASS_RE.test(value)
  VUE_SCOPED_ATTR_RE.lastIndex = 0
  VUE_SCOPED_CLASS_RE.lastIndex = 0
  return matched
}

export function normalizeCssSignatureValue(value: string) {
  return value
    .replace(VUE_SCOPED_ATTR_RE, '')
    .replace(VUE_SCOPED_CLASS_RE, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([>+~])\s*/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim()
}

function hasClassSelector(selector: string) {
  return /(?:^|[^\\])\.[_a-z\u00A0-\uFFFF-]/i.test(normalizeCssSignatureValue(selector))
}

function isLikelyTailwindGlobalSelector(selector: string) {
  const normalized = normalizeCssSignatureValue(selector)
  return normalized === '*'
    || normalized.startsWith('::')
    || normalized.startsWith(':root')
    || normalized.startsWith(':host')
    || /^(?:html|body|hr|abbr|h1|h2|h3|h4|h5|h6|a|b|strong|code|kbd|samp|pre|small|sub|sup|table|button|input|select|optgroup|textarea|summary|blockquote|dl|dd|fieldset|legend|ol|ul|menu|dialog|progress|video|audio|canvas|embed|iframe|img|object|svg|details|template|[uo]ni-progress)(?:$|[:,[\s>+~.#])/.test(normalized)
}

function isTailwindPreflightDeclaration(decl: Declaration) {
  const prop = decl.prop.trim().toLowerCase()
  const value = normalizeCssSignatureValue(decl.value.trim().toLowerCase())
  if (prop.startsWith('--tw-')) {
    return true
  }
  if (prop === 'color' && value.startsWith('color-mix(') && value.includes('currentcolor') && value.includes('transparent')) {
    return true
  }
  if (prop === 'color' && value === 'currentcolor') {
    return true
  }
  if (
    (prop === 'font-family' && value.startsWith('var(--default-font-family'))
    || (prop === 'font-feature-settings' && value.startsWith('var(--default-font-feature-settings'))
    || (prop === 'font-variation-settings' && value.startsWith('var(--default-font-variation-settings'))
  ) {
    return true
  }
  return TAILWIND_PREFLIGHT_DECLARATIONS.has(`${prop}:${value}`)
}

function getRuleDeclarations(rule: Rule) {
  return rule.nodes?.filter((node): node is Declaration => node.type === 'decl') ?? []
}

function isScopedTailwindThemeCarrierRule(rule: Rule) {
  const selectors = rule.selectors ?? [rule.selector]
  const declarations = getRuleDeclarations(rule)
  return selectors.length > 0
    && selectors.every((selector) => {
      const normalized = normalizeCssSignatureValue(selector)
      return hasVueScopedAttr(selector) && (normalized.startsWith(':root') || normalized.startsWith(':host'))
    })
    && declarations.length > 0
    && declarations.every(decl => decl.prop.startsWith('--'))
}

export function isScopedUniversalTailwindPreflightRule(rule: Rule) {
  const selectors = rule.selectors ?? [rule.selector]
  const declarations = getRuleDeclarations(rule)
  return selectors.length > 0
    && selectors.every(selector => hasVueScopedAttr(selector) && SCOPED_UNIVERSAL_PREFLIGHT_SELECTORS.has(normalizeCssSignatureValue(selector)))
    && declarations.length > 0
    && declarations.every(decl => decl.prop.startsWith('--tw-') || MINI_PROGRAM_PREFLIGHT_DECLARATIONS.has(decl.prop))
}

export function isScopedUniAppWebTailwindPreflightRule(rule: Rule) {
  const selectors = rule.selectors ?? [rule.selector]
  const declarations = getRuleDeclarations(rule)
  return selectors.length > 0
    && selectors.every(selector => hasVueScopedAttr(selector) && UNI_APP_WEB_PREFLIGHT_SELECTORS.has(normalizeCssSignatureValue(selector)))
    && declarations.length > 0
    && declarations.every(decl => decl.prop.startsWith('--tw-') || MINI_PROGRAM_PREFLIGHT_DECLARATIONS.has(decl.prop))
}

export function hasScopedUniAppWebTailwindPreflightRule(css: string) {
  return /uni-(?:view|text)\[data-v-[^\]]+\]/i.test(css)
    && /\[data-v-[^\]]+\]::(?:after|before)/i.test(css)
}

export function isLikelyTailwindGlobalRule(rule: Rule) {
  const selectors = rule.selectors ?? [rule.selector]
  const declarations = getRuleDeclarations(rule)
  return isScopedTailwindThemeCarrierRule(rule)
    || isScopedUniversalTailwindPreflightRule(rule)
    || isScopedUniAppWebTailwindPreflightRule(rule)
    || (
      selectors.every(selector => !hasClassSelector(selector) && isLikelyTailwindGlobalSelector(selector))
      && declarations.length > 0
      && declarations.every(isTailwindPreflightDeclaration)
    )
}

export function isLikelyTailwindPropertyAtRule(atRule: AtRule) {
  return atRule.name.toLowerCase() === 'property'
    && normalizeCssSignatureValue(atRule.params).startsWith('--tw-')
}

export function isLikelyTailwindLayerOrderAtRule(atRule: AtRule) {
  if (atRule.name.toLowerCase() !== 'layer' || atRule.nodes !== undefined) {
    return false
  }
  const params = normalizeCssSignatureValue(atRule.params).replace(/\s+/g, '')
  return params === 'properties'
    || params === 'theme'
    || params === 'base'
    || params === 'theme,base,components,utilities'
}

export function isUnscopedMiniProgramTailwindPreflightRule(rule: Rule) {
  const selectors = rule.selectors ?? [rule.selector]
  if (
    selectors.length === 0
    || !selectors.every((selector) => {
      const normalized = normalizeCssSignatureValue(selector)
      return !hasVueScopedAttr(selector) && MINI_PROGRAM_PREFLIGHT_SELECTORS.has(normalized)
    })
  ) {
    return false
  }
  const declarations = getRuleDeclarations(rule)
  return declarations.length > 0
    && declarations.every(decl => decl.prop.startsWith('--tw-') || MINI_PROGRAM_PREFLIGHT_DECLARATIONS.has(decl.prop))
}

export function isScopedMiniProgramTailwindContentInitRule(rule: Rule) {
  const selectors = rule.selectors ?? [rule.selector]
  if (
    selectors.length === 0
    || !selectors.every((selector) => {
      const normalized = normalizeCssSignatureValue(selector)
      return hasVueScopedAttr(selector) && MINI_PROGRAM_PREFLIGHT_SELECTORS.has(normalized)
    })
  ) {
    return false
  }
  const declarations = getRuleDeclarations(rule)
  return declarations.length > 0 && declarations.every(decl => decl.prop === '--tw-content')
}

export function hasUnscopedMiniProgramTailwindPreflightRule(css: string) {
  return /(?:^|[{}])\s*view\s*,\s*text\s*,\s*::after\s*,\s*::before\s*\{/.test(css)
}

export function hasScopedMiniProgramTailwindContentInitRule(css: string) {
  return /(?:^|[{}])[^{}]*\.data-v-[\w-][^{}]*\{\s*--tw-content\s*:/.test(css)
}
