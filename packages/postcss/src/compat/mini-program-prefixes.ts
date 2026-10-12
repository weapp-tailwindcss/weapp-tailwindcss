import type { AtRule, Declaration } from 'postcss'

const PRESERVED_WEBKIT_DECLARATION_PROPS = new Set([
  '-webkit-box-orient',
  '-webkit-font-smoothing',
  '-webkit-line-clamp',
  '-webkit-overflow-scrolling',
  '-webkit-text-fill-color',
  '-webkit-text-stroke',
  '-webkit-text-stroke-color',
  '-webkit-text-stroke-width',
])

const PRESERVED_WEBKIT_VALUE_DECLARATIONS = new Map<string, Set<string>>([
  ['display', new Set(['-webkit-box'])],
  ['-webkit-background-clip', new Set(['text'])],
])

const TRANSITION_PROPS = new Set([
  'transition',
  'transition-property',
])

/** 将扩展名单归一为完整 WebKit 属性名，不修改调用方数组。 */
export function normalizePreservedWebkitProperties(properties?: readonly string[]): ReadonlySet<string> | undefined {
  if (!Array.isArray(properties) || properties.length === 0) {
    return undefined
  }
  const normalized = new Set<string>()
  for (const property of properties) {
    if (typeof property !== 'string') {
      continue
    }
    const name = property.trim().toLowerCase()
    if (/^-webkit-[a-z][a-z0-9-]*$/.test(name)) {
      normalized.add(name)
    }
  }
  return normalized.size > 0 ? normalized : undefined
}

function splitTopLevelCommaList(value: string) {
  const parts: string[] = []
  let start = 0
  let depth = 0
  let quote: string | undefined
  let escaped = false

  for (let i = 0; i < value.length; i++) {
    const char = value[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (quote) {
      if (char === quote) {
        quote = undefined
      }
      continue
    }
    if (char === '"' || char === '\'') {
      quote = char
      continue
    }
    if (char === '(') {
      depth++
      continue
    }
    if (char === ')') {
      depth = Math.max(0, depth - 1)
      continue
    }
    if (char === ',' && depth === 0) {
      parts.push(value.slice(start, i))
      start = i + 1
    }
  }

  parts.push(value.slice(start))
  return parts
}

function isPreservedWebkitDeclaration(decl: Declaration, preservedProperties?: ReadonlySet<string>) {
  const prop = decl.prop.toLowerCase()
  if (prop.startsWith('-webkit-mask')) {
    return true
  }
  if (PRESERVED_WEBKIT_DECLARATION_PROPS.has(prop) || preservedProperties?.has(prop)) {
    return true
  }

  const preservedValues = PRESERVED_WEBKIT_VALUE_DECLARATIONS.get(prop)
  return preservedValues?.has(decl.value.trim().toLowerCase()) ?? false
}

function normalizeTransitionValue(value: string) {
  return splitTopLevelCommaList(value)
    .map(part => part.trim())
    .filter(part => part.length > 0 && !part.toLowerCase().startsWith('-webkit-'))
    .join(', ')
}

function hasUnsupportedWebkitKeywordValue(decl: Declaration) {
  const value = decl.value.trim().toLowerCase()
  if (!value.startsWith('-webkit-')) {
    return false
  }
  const preservedValues = PRESERVED_WEBKIT_VALUE_DECLARATIONS.get(decl.prop.toLowerCase())
  if (preservedValues?.has(value)) {
    return false
  }
  return /^-webkit-[\w-]+$/.test(value)
}

/**
 * 收敛小程序 CSS 中的 WebKit 前缀，只保留 WXSS 里有实际价值的兼容写法。
 */
export function normalizeMiniProgramPrefixedDeclaration(decl: Declaration, preservedProperties?: ReadonlySet<string>) {
  const prop = decl.prop.toLowerCase()
  if (TRANSITION_PROPS.has(prop) && decl.value.toLowerCase().includes('-webkit-')) {
    const value = normalizeTransitionValue(decl.value)
    if (value.length === 0) {
      decl.remove()
      return
    }
    decl.value = value
  }

  if (prop.startsWith('-webkit-') && !isPreservedWebkitDeclaration(decl, preservedProperties)) {
    decl.remove()
    return
  }

  if (hasUnsupportedWebkitKeywordValue(decl)) {
    decl.remove()
  }
}

export function removeUnsupportedMiniProgramPrefixedAtRule(atRule: AtRule) {
  if (atRule.name.toLowerCase() === '-webkit-keyframes') {
    atRule.remove()
  }
}
