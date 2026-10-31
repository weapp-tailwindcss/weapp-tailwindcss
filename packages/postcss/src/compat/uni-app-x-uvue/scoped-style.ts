import type { Result as PostcssResult, Rule } from 'postcss'
import type postcss from 'postcss'

const MINI_PROGRAM_PREFLIGHT_SELECTORS = new Set(['view', 'text', '::after', '::before'])
const SCOPED_UNIVERSAL_PREFLIGHT_SELECTORS = new Set(['*', '::after', '::before', '::backdrop', '::file-selector-button'])
const TAILWIND_VERSION_COMMENT_RE = /tailwindcss v\d/i
const VUE_SCOPED_ATTR_RE = /\[data-v-[^\]]+\]/gi
const VUE_SCOPED_CLASS_RE = /\.data-v-[\w-]+/gi

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

function hasVueScopedAttr(value: string) {
  VUE_SCOPED_ATTR_RE.lastIndex = 0
  VUE_SCOPED_CLASS_RE.lastIndex = 0
  const matched = VUE_SCOPED_ATTR_RE.test(value) || VUE_SCOPED_CLASS_RE.test(value)
  VUE_SCOPED_ATTR_RE.lastIndex = 0
  VUE_SCOPED_CLASS_RE.lastIndex = 0
  return matched
}

function normalizeCssSignatureValue(value: string) {
  return value
    .replace(VUE_SCOPED_ATTR_RE, '')
    .replace(VUE_SCOPED_CLASS_RE, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([>+~])\s*/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim()
}

function isSfcStyleRequestSource(source: unknown) {
  if (typeof source !== 'string') {
    return false
  }
  const queryIndex = source.indexOf('?')
  if (queryIndex < 0 || !source.slice(0, queryIndex).toLowerCase().endsWith('.uvue')) {
    return false
  }
  const hashIndex = source.indexOf('#', queryIndex)
  const query = source.slice(queryIndex + 1, hashIndex < 0 ? undefined : hashIndex)
  return new URLSearchParams(query).get('type') === 'style'
}

export function isUvueSfcStyleRequest(result: Pick<PostcssResult, 'root' | 'opts'>) {
  if (isSfcStyleRequestSource(result.opts.from)) {
    return true
  }

  if (isSfcStyleRequestSource(result.root.source?.input.from)) {
    return true
  }

  if ((result.root.nodes ?? []).some(node => isSfcStyleRequestSource(node.source?.input.from))) {
    return true
  }

  let hasScopedSelector = false
  result.root.walkRules((rule) => {
    if ((rule.selectors ?? [rule.selector]).some(hasVueScopedAttr)) {
      hasScopedSelector = true
      return false
    }
  })
  return hasScopedSelector
}

function getDeclarations(rule: Rule) {
  return rule.nodes?.filter((node): node is postcss.Declaration => node.type === 'decl') ?? []
}

function isLikelyTailwindGlobalSelector(selector: string) {
  const normalized = normalizeCssSignatureValue(selector)
  return normalized === '*'
    || normalized.startsWith('::')
    || normalized.startsWith(':root')
    || normalized.startsWith(':host')
    || /^(?:html|body|hr|abbr|h1|h2|h3|h4|h5|h6|a|b|strong|code|kbd|samp|pre|small|sub|sup|table|button|input|select|optgroup|textarea|summary|blockquote|dl|dd|fieldset|legend|ol|ul|menu|dialog|progress|video|audio|canvas|embed|iframe|img|object|svg|details|template|[uo]ni-progress)(?:$|[:,[\s>+~.#])/.test(normalized)
}

function isTailwindPreflightDeclaration(decl: postcss.Declaration) {
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

function hasTailwindSourceEvidence(declarations: postcss.Declaration[], hasTailwindBanner: boolean) {
  return hasTailwindBanner || declarations.some(decl => decl.prop.startsWith('--tw-'))
}

function isScopedTailwindThemeCarrierRule(rule: Rule, hasTailwindBanner: boolean) {
  const selectors = rule.selectors ?? [rule.selector]
  const declarations = getDeclarations(rule)
  return selectors.length > 0
    && selectors.every((selector) => {
      const normalized = normalizeCssSignatureValue(selector)
      return hasVueScopedAttr(selector) && (normalized.startsWith(':root') || normalized.startsWith(':host'))
    })
    && declarations.length > 0
    && declarations.every(decl => decl.prop.startsWith('--'))
    && hasTailwindSourceEvidence(declarations, hasTailwindBanner)
}

function isScopedUniversalTailwindPreflightRule(rule: Rule, hasTailwindBanner: boolean) {
  const selectors = rule.selectors ?? [rule.selector]
  const declarations = getDeclarations(rule)
  return selectors.length > 0
    && selectors.every(selector => hasVueScopedAttr(selector) && SCOPED_UNIVERSAL_PREFLIGHT_SELECTORS.has(normalizeCssSignatureValue(selector)))
    && declarations.length > 0
    && declarations.every(decl => decl.prop.startsWith('--tw-') || ['box-sizing', 'margin', 'padding', 'border'].includes(decl.prop))
    && hasTailwindSourceEvidence(declarations, hasTailwindBanner)
}

function isScopedTailwindElementPreflightRule(rule: Rule, hasTailwindBanner: boolean) {
  if (!hasTailwindBanner) {
    return false
  }
  const selectors = rule.selectors ?? [rule.selector]
  const declarations = getDeclarations(rule)
  return selectors.length > 0
    && selectors.every(selector => hasVueScopedAttr(selector) && isLikelyTailwindGlobalSelector(selector))
    && declarations.length > 0
    && declarations.every(isTailwindPreflightDeclaration)
}

function isUnscopedMiniProgramTailwindPreflightRule(rule: Rule, hasTailwindBanner: boolean) {
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
  const declarations = getDeclarations(rule)
  return declarations.length > 0
    && declarations.every(decl => decl.prop.startsWith('--tw-') || ['box-sizing', 'margin', 'padding', 'border'].includes(decl.prop))
    && hasTailwindSourceEvidence(declarations, hasTailwindBanner)
}

function isScopedMiniProgramTailwindContentInitRule(rule: Rule) {
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
  const declarations = getDeclarations(rule)
  return declarations.length > 0 && declarations.every(decl => decl.prop === '--tw-content')
}

function isLikelyTailwindPropertyAtRule(atRule: postcss.AtRule) {
  return typeof atRule.name === 'string'
    && atRule.name.toLowerCase() === 'property'
    && normalizeCssSignatureValue(atRule.params).startsWith('--tw-')
}

export function stripScopedTailwindNoise(root: postcss.Root) {
  let hasTailwindBanner = false
  root.walkComments((comment) => {
    if (TAILWIND_VERSION_COMMENT_RE.test(comment.text)) {
      hasTailwindBanner = true
    }
  })

  root.walkComments((comment) => {
    if (TAILWIND_VERSION_COMMENT_RE.test(comment.text)) {
      comment.remove()
    }
  })
  root.walkRules((rule) => {
    if (
      isScopedTailwindThemeCarrierRule(rule, hasTailwindBanner)
      || isScopedUniversalTailwindPreflightRule(rule, hasTailwindBanner)
      || isScopedTailwindElementPreflightRule(rule, hasTailwindBanner)
      || isUnscopedMiniProgramTailwindPreflightRule(rule, hasTailwindBanner)
      || isScopedMiniProgramTailwindContentInitRule(rule)
    ) {
      rule.remove()
    }
  })
  root.walkAtRules((atRule) => {
    if (isLikelyTailwindPropertyAtRule(atRule)) {
      atRule.remove()
      return
    }
    if ((atRule.nodes?.length ?? 0) === 0) {
      atRule.remove()
    }
  })
}
