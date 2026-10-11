import type { Root, Rule } from 'postcss'
import { Declaration } from 'postcss'
import cssVarsV4 from '../../cssVarsV4'
import { createCssVarNodes } from '../../utils/css-vars'

export const RADIUS_THRESHOLD = 100000
export const CLAMP_PX = 9999
export const INFINITY_CALC_VALUE_REGEXP = /^calc\(\s*infinity\s*\*\s*(\d+(?:\.\d*)?|\.\d+)r?px\s*\)$/i

// 用于 isTailwindcssV4ModernCheck 的正则列表
export const MODERN_CHECK_WEBKIT_HYPHENS_RE = /-webkit-hyphens\s*:\s*none/
export const MODERN_CHECK_MARGIN_TRIM_RE = /margin-trim\s*:\s*inline/
export const MODERN_CHECK_MOZ_ORIENT_RE = /-moz-orient\s*:\s*inline/
export const MODERN_CHECK_COLOR_RGB_RE = /color\s*:\s*rgb\(\s*from\s+red\s+r\s+g\s+b\s*\)/
export const LINEAR_GRADIENT_LAB_RE = /background-image\s*:\s*linear-gradient\(\s*in\s+lab\s*,\s*red\s*,\s*red\s*\)/
export const DISPLAY_P3_COLOR_RE = /color\s*:\s*color\(\s*display-p3\s+0\s+0\s+0%\s*\)/
export const DISPLAY_P3_VALUE_RE = /color\(\s*display-p3\b/i
export const COLOR_GAMUT_P3_RE = /\(\s*color-gamut\s*:\s*p3\s*\)/i
export const GRADIENT_BACKGROUND_RE = /^(linear|radial|conic)-gradient\(/i
export const GRADIENT_STOPS_VAR_RE = /^(?:linear|radial|conic)-gradient\(\s*var\(\s*--tw-gradient-stops\b/i
export const SIMPLE_CLASS_SELECTOR_RE = /^\.([_a-z\u00A0-\uFFFF\\-][\w\u00A0-\uFFFF\\-]*)$/i
export const COLOR_VAR_RE = /^var\(\s*(--color-[\w-]+)\s*\)$/i
export const TAILWIND_THEME_VARIABLE_RE = /^--(?:animate|aspect|blur|breakpoint|color|container|drop-shadow|ease|font|inset-shadow|leading|perspective|radius|shadow|spacing|text|tracking)(?:-|$)/
export const GRADIENT_DIRECTION_CLASS_RE = /^(?:-?bg-linear|bg-gradient-to-|-?bg-conic|bg-radial)/

// 用于 normalizeTailwindcssV4Declaration 的正则
export const RADIUS_VALUE_RE = /\b([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?)\s*(r?px)\b/gi
export const SCIENTIFIC_NOTATION_RE = /e/i
const TW_VAR_FUNCTION_RE = /var\(\s*(--tw-[\w-]+)\b/g
const TW_CONTENT_VAR_RE = /var\(\s*--tw-content\b/
export const TW_GRADIENT_POSITION_PROPS = new Set([
  '--tw-gradient-from-position',
  '--tw-gradient-via-position',
  '--tw-gradient-to-position',
])
const UNSUPPORTED_CUSTOM_PROPERTY_DEFAULT_PROPS = new Set([
  '--tw-gradient-via-stops',
])
const DEFAULT_VARIABLE_SCOPE_SELECTORS = new Set([
  '*',
  'view',
  'text',
  ':before',
  ':after',
  '::before',
  '::after',
  '::backdrop',
])

export function isTailwindcssV4(options?: { majorVersion?: 4 }) {
  return options?.majorVersion === 4
}

export function isTailwindcssV4ThemeVariable(property: string) {
  return property.startsWith('--tw-') || TAILWIND_THEME_VARIABLE_RE.test(property)
}

// Tailwind v4 会把 :root 与 :host 组合在一起，这里单独识别
export function testIfRootHostForV4(node: Rule) {
  return node.type === 'rule' && node.selector.includes(':root') && node.selector.includes(':host')
}

// Tailwind CSS v4 默认 CSS 变量映射，参考官方 utilities 定义
export const cssVarsV4Nodes = createCssVarNodes(cssVarsV4)

// 从当前 CSS 中收集实际引用到的 Tailwind v4 变量，用于按需注入默认值
export function collectUsedTailwindcssV4Variables(root: Root) {
  const props = new Set<string>()
  root.walkDecls((decl) => {
    if (decl.prop.startsWith('--tw-')) {
      props.add(decl.prop)
    }
    TW_VAR_FUNCTION_RE.lastIndex = 0
    let match = TW_VAR_FUNCTION_RE.exec(decl.value)
    while (match !== null) {
      const prop = match[1]
      if (prop) {
        props.add(prop)
      }
      match = TW_VAR_FUNCTION_RE.exec(decl.value)
    }
  })
  root.walkAtRules('property', (atRule) => {
    const prop = atRule.params.trim()
    if (prop.startsWith('--tw-')) {
      props.add(prop)
    }
  })
  return props
}

// 判断当前 CSS 是否实际依赖 --tw-content 的默认值
export function usesTailwindcssV4ContentVariable(root: Root) {
  let used = false
  root.walkDecls((decl) => {
    if (TW_CONTENT_VAR_RE.test(decl.value)) {
      used = true
    }
  })
  return used
}

// Tailwind v4 的变量默认值只为当前 CSS 实际使用到的变量补齐，避免全量变量串入
export function createUsedCssVarsV4Nodes(usedProps: ReadonlySet<string>) {
  return cssVarsV4
    .filter(def => usedProps.has(def.prop) && !UNSUPPORTED_CUSTOM_PROPERTY_DEFAULT_PROPS.has(def.prop))
    .map(def => new Declaration({
      prop: def.prop,
      value: def.value,
    }))
}

function isInsideAtRule(decl: PostcssDeclaration, name: string) {
  let parent = decl.parent
  while (parent) {
    if (parent.type === 'atrule' && parent.name === name) {
      return true
    }
    parent = parent.parent
  }
  return false
}

function isDefaultVariableScopeRule(rule: Rule) {
  const selectors = rule.selectors.map(selector => selector.trim())
  if (!selectors.every(selector => DEFAULT_VARIABLE_SCOPE_SELECTORS.has(selector))) {
    return false
  }
  if (!selectors.some(selector => selector === '*' || selector === 'view' || selector === 'text')) {
    return false
  }
  let hasDeclaration = false
  let onlyCustomProperties = true
  rule.each((node) => {
    if (node.type !== 'decl') {
      return
    }
    hasDeclaration = true
    if (!node.prop.startsWith('--')) {
      onlyCustomProperties = false
    }
  })
  return hasDeclaration && onlyCustomProperties
}

function collectScopedTailwindcssV4DefaultVariables(root: Root) {
  const props = new Set<string>()
  root.walkDecls((decl) => {
    if (!decl.prop.startsWith('--tw-')) {
      return
    }
    if (isInsideAtRule(decl, 'supports')) {
      return
    }
    if (decl.parent?.type === 'rule' && isDefaultVariableScopeRule(decl.parent)) {
      props.add(decl.prop)
    }
  })
  return props
}

// 为会移除 @property 的小程序产物补齐缺失的 Tailwind v4 运行时默认变量
export function createMissingCssVarsV4Nodes(root: Root, usedProps: ReadonlySet<string>) {
  const scopedProps = collectScopedTailwindcssV4DefaultVariables(root)
  return cssVarsV4
    .filter(def => usedProps.has(def.prop) && !scopedProps.has(def.prop) && !UNSUPPORTED_CUSTOM_PROPERTY_DEFAULT_PROPS.has(def.prop))
    .map(def => new Declaration({
      prop: def.prop,
      value: def.value,
    }))
}
