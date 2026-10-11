import { postcss } from '../postcss-runtime'

export const MINI_PROGRAM_PREFLIGHT_SELECTOR_KEY = 'view,text,::after,::before'
export const MINI_PROGRAM_PREFLIGHT_SELECTOR_KEYS = new Set(['view', 'text', '::after', '::before'])
export const MINI_PROGRAM_THEME_SCOPE_SELECTOR_KEY = ':host,page,.tw-root,wx-root-portal-content'
export const MINI_PROGRAM_THEME_SCOPE_SELECTOR_KEYS = new Set([':host', 'page', '.tw-root', 'wx-root-portal-content'])

export function normalizeCssForContainment(css: string) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/::(before|after)\b/g, ':$1')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>+~()])\s*/g, '$1')
    .replace(/;\}/g, '}')
    .trim()
}

export function collectNormalizedCssNodes(css: string) {
  try {
    const root = postcss.parse(css)
    return (root.nodes ?? [])
      .filter(node => node.type !== 'comment')
      .map(node => normalizeCssForContainment(node.toString()))
      .filter(Boolean)
  }
  catch {
    const normalizedCss = normalizeCssForContainment(css)
    return normalizedCss ? [normalizedCss] : []
  }
}

function normalizeCssRuleKeyPart(value: string) {
  return value
    .replace(/::(before|after)\b/g, ':$1')
    .replace(/\s+/g, ' ')
    .replace(/\s*([>+~(),])\s*/g, '$1')
    .trim()
}

function getRuleAtRuleChain(rule: postcss.Rule) {
  const chain: string[] = []
  let parent = rule.parent
  while (parent && parent.type !== 'root') {
    if (parent.type === 'atrule') {
      chain.unshift(`@${parent.name} ${normalizeCssRuleKeyPart(parent.params)}`)
    }
    parent = parent.parent
  }
  return chain
}

export function getCssRuleStructuralKey(rule: postcss.Rule) {
  const selector = normalizeCssRuleKeyPart(rule.selector)
  if (selector.length === 0) {
    return undefined
  }
  return [
    ...getRuleAtRuleChain(rule),
    selector,
  ].join('|')
}

export function getCssRuleStructuralKeyWithSelectorKey(rule: postcss.Rule, selectorKey: string) {
  return [
    ...getRuleAtRuleChain(rule),
    selectorKey,
  ].join('|')
}

export function getCssRuleContentKey(rule: postcss.Rule, content = normalizeCssForContainment(rule.toString())) {
  const structuralKey = getCssRuleStructuralKey(rule)
  if (!structuralKey) {
    return undefined
  }
  return [
    structuralKey,
    content,
  ].join('|')
}

export function collectCssRuleContentKeys(css: string | postcss.Root, requiredBaseContent?: string) {
  const keys = new Set<string>()
  try {
    const root = typeof css === 'string' ? postcss.parse(css) : css
    root.walkRules((rule) => {
      const content = normalizeCssForContainment(rule.toString())
      const key = getCssRuleContentKey(rule, content)
      if (key) {
        // 结构键包含完整规则文本；文本缺失时不可能被主样式的结构键集合覆盖。
        if (requiredBaseContent !== undefined && !requiredBaseContent.includes(content)) {
          keys.clear()
          return false
        }
        keys.add(key)
      }
    })
  }
  catch {
  }
  return keys
}

export function normalizeCssDeclarationKey(decl: postcss.Declaration) {
  return [
    decl.prop.trim(),
    normalizeCssForContainment(decl.value),
    decl.important ? '!important' : '',
  ].join(':')
}

function parseVarFallbackValue(value: string) {
  const trimmed = value.trim()
  if (!trimmed.startsWith('var(') || !trimmed.endsWith(')')) {
    return undefined
  }
  const body = trimmed.slice(4, -1)
  const commaIndex = body.indexOf(',')
  if (commaIndex === -1) {
    return undefined
  }
  const customPropertyName = body.slice(0, commaIndex).trim()
  if (!customPropertyName.startsWith('--') || /\s/.test(customPropertyName)) {
    return undefined
  }
  const fallback = body.slice(commaIndex + 1).trim()
  return fallback.length > 0 ? fallback : undefined
}

export function parseVarReferenceValue(value: string) {
  const trimmed = value.trim()
  if (!trimmed.startsWith('var(') || !trimmed.endsWith(')')) {
    return undefined
  }
  const body = trimmed.slice(4, -1).trim()
  return body.startsWith('--') && !body.includes(',') && !/\s/.test(body)
    ? body
    : undefined
}

export function isEquivalentVarFallbackDeclaration(
  incoming: postcss.Declaration,
  baseDeclarations: Set<string>,
) {
  const fallback = parseVarFallbackValue(incoming.value)
  if (!fallback) {
    return false
  }
  return baseDeclarations.has([
    incoming.prop.trim(),
    normalizeCssForContainment(fallback),
    incoming.important ? '!important' : '',
  ].join(':'))
}

export function isCoveredByBaseVarFallbackDeclaration(
  incoming: postcss.Declaration,
  baseDeclarations: Set<string>,
) {
  const normalizedValue = normalizeCssForContainment(incoming.value)
  const importantSuffix = `:${incoming.important ? '!important' : ''}`
  const prefix = `${incoming.prop.trim()}:var(`
  for (const declaration of baseDeclarations) {
    if (!declaration.startsWith(prefix) || !declaration.endsWith(importantSuffix)) {
      continue
    }
    const value = declaration.slice(incoming.prop.trim().length + 1, declaration.length - importantSuffix.length)
    const fallback = parseVarFallbackValue(value)
    if (fallback && normalizeCssForContainment(fallback) === normalizedValue) {
      return true
    }
  }
  return false
}

export function collectCssRuleDeclarationKeys(rule: postcss.Rule) {
  const keys = new Set<string>()
  for (const node of rule.nodes ?? []) {
    if (node.type === 'decl') {
      keys.add(normalizeCssDeclarationKey(node))
    }
  }
  return keys
}

function collectCssRuleDeclarationProps(rule: postcss.Rule) {
  const props = new Set<string>()
  for (const node of rule.nodes ?? []) {
    if (node.type === 'decl') {
      props.add(node.prop.trim())
    }
  }
  return props
}

export function collectCssRuleDeclarations(rule: postcss.Rule) {
  return (rule.nodes ?? []).filter((node): node is postcss.Declaration => node.type === 'decl')
}

export function collectCssRuleDeclarationKeyMap(css: string | postcss.Root) {
  const map = new Map<string, Set<string>>()
  try {
    const root = typeof css === 'string' ? postcss.parse(css) : css
    root.walkRules((rule) => {
      const key = getCssRuleStructuralKey(rule)
      if (!key) {
        return
      }
      const declarations = collectCssRuleDeclarationKeys(rule)
      if (declarations.size === 0) {
        return
      }
      let existing = map.get(key)
      if (!existing) {
        existing = new Set<string>()
        map.set(key, existing)
      }
      for (const declaration of declarations) {
        existing.add(declaration)
      }
    })
  }
  catch {
  }
  return map
}

interface CssRuleDeclarationRecord {
  rule: postcss.Rule
  keys: Set<string>
  props: Set<string>
}

type CssRuleKeyResolver = (rule: postcss.Rule) => string | undefined

export function collectCssRuleDeclarationRecords(
  root: postcss.Root,
  resolveRuleKey: CssRuleKeyResolver = getCssRuleStructuralKey,
) {
  const map = new Map<string, CssRuleDeclarationRecord[]>()
  root.walkRules((rule) => {
    const key = resolveRuleKey(rule)
    if (!key) {
      return
    }
    const keys = collectCssRuleDeclarationKeys(rule)
    if (keys.size === 0) {
      return
    }
    const records = map.get(key) ?? []
    records.push({
      rule,
      keys,
      props: collectCssRuleDeclarationProps(rule),
    })
    map.set(key, records)
  })
  return map
}
