import type { Declaration, Rule } from 'postcss'
import { reorderLiteralFirst } from '../../utils/decl-order'

const logicalPropMap = new Map<string, string>([
  // margin 方向映射
  ['margin-inline-start', 'margin-left'],
  ['margin-inline-end', 'margin-right'],
  ['margin-block-start', 'margin-top'],
  ['margin-block-end', 'margin-bottom'],
  // padding 方向映射
  ['padding-inline-start', 'padding-left'],
  ['padding-inline-end', 'padding-right'],
  ['padding-block-start', 'padding-top'],
  ['padding-block-end', 'padding-bottom'],
  // border 方向映射
  ['border-inline-start', 'border-left'],
  ['border-inline-end', 'border-right'],
  ['border-block-start', 'border-top'],
  ['border-block-end', 'border-bottom'],
  ['border-inline-start-width', 'border-left-width'],
  ['border-inline-end-width', 'border-right-width'],
])

const variablePriorityProps = new Set([
  'margin-left',
  'margin-right',
  'margin-top',
  'margin-bottom',
  'border-left-width',
  'border-right-width',
  'border-top-width',
  'border-bottom-width',
])

function getCanonicalProp(prop: string) {
  return logicalPropMap.get(prop) ?? prop
}

const NESTED_CALC_RE = /calc\(\s*calc\(/gi
const CALC_WRAP_RE = /calc\(\s*(1\s*-\s*var\([^()]+\))\s*\)/gi

// normalizeCalcValue 消除嵌套 calc 带来的冗余括号，兼容小程序解析器
function normalizeCalcValue(value: string) {
  if (!value.includes('calc')) {
    return value
  }

  let next = value
  let prev: string

  do {
    prev = next
    NESTED_CALC_RE.lastIndex = 0
    next = prev.replace(NESTED_CALC_RE, 'calc((')
  } while (next !== prev)

  CALC_WRAP_RE.lastIndex = 0
  return next.replace(CALC_WRAP_RE, '($1)')
}

interface DedupeEntry {
  decl: Declaration
  normalizedValue: string
  canonicalProp: string
  importantKey: string
  isLogical: boolean
}

function hasVariableReference(value: string) {
  return value.includes('var(')
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

function getTransitionPropertySet(value: string) {
  const items = splitTopLevelCommaList(value)
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)
  return items.length > 0 ? new Set(items) : undefined
}

function isSubsetOfSet(subset: Set<string>, superset: Set<string>) {
  for (const item of subset) {
    if (!superset.has(item)) {
      return false
    }
  }
  return true
}

export function removeRedundantTransitionPropertyFallbacks(rule: Rule) {
  const declarations = rule.nodes.filter((node): node is Declaration =>
    node.type === 'decl' && node.prop.toLowerCase() === 'transition-property',
  )
  const entries = declarations.map(decl => ({
    decl,
    items: getTransitionPropertySet(decl.value),
  }))

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    if (!entry?.items) {
      continue
    }

    for (let j = i + 1; j < entries.length; j++) {
      const next = entries[j]
      if (!next?.items) {
        continue
      }
      if (next.items.size === entry.items.size && isSubsetOfSet(entry.items, next.items)) {
        next.decl.remove()
        entries.splice(j, 1)
        j--
        continue
      }
      if (next.items.size > entry.items.size && isSubsetOfSet(entry.items, next.items)) {
        entry.decl.remove()
        break
      }
    }
  }
}

// reorderVariableDeclarations 确保普通声明在变量声明之前，避免被变量覆盖
export function reorderVariableDeclarations(rule: Rule) {
  const groupedByProp = new Map<string, Declaration[]>()

  for (const node of rule.nodes) {
    if (node.type !== 'decl') {
      continue
    }
    if (node.prop.startsWith('--')) {
      continue
    }
    const existing = groupedByProp.get(node.prop)
    if (existing) {
      existing.push(node)
    }
    else {
      groupedByProp.set(node.prop, [node])
    }
  }

  for (const declarations of groupedByProp.values()) {
    reorderLiteralFirst(
      rule,
      declarations,
      decl => hasVariableReference(decl.value),
    )
  }
}

// dedupeDeclarations 去除逻辑属性与变量重复定义，保留最优组合
export function dedupeDeclarations(rule: Rule) {
  const entries: DedupeEntry[] = []

  for (const node of [...rule.nodes]) {
    if (node.type !== 'decl') {
      continue
    }
    const decl = node
    const normalizedValue = normalizeCalcValue(decl.value)
    if (normalizedValue !== decl.value) {
      decl.value = normalizedValue
    }
    const canonicalProp = getCanonicalProp(decl.prop)
    entries.push({
      decl,
      normalizedValue,
      canonicalProp,
      importantKey: decl.important ? '!important' : '',
      isLogical: canonicalProp !== decl.prop,
    })
  }

  const customProperties = new Map<string, DedupeEntry>()
  const ordinaryProperties = new Map<string, DedupeEntry>()
  let previousOrdinaryProp: string | undefined

  for (const entry of entries) {
    const isCustomProperty = entry.canonicalProp.startsWith('--')
    if (!isCustomProperty && previousOrdinaryProp !== entry.canonicalProp) {
      // 不推测 shorthand 与 longhand 的重叠关系，跨普通属性时保留作者顺序。
      ordinaryProperties.clear()
      previousOrdinaryProp = entry.canonicalProp
    }
    const seen = isCustomProperty ? customProperties : ordinaryProperties
    const key = `${entry.canonicalProp}${entry.importantKey}`
    const existing = seen.get(key)
    // 自定义属性独立参与层叠；同属性的不同值会重新建立去重边界。
    if (!existing || existing.normalizedValue !== entry.normalizedValue) {
      seen.set(key, entry)
      continue
    }

    if (existing.isLogical && !entry.isLogical) {
      existing.decl.remove()
      seen.set(key, entry)
    }
    else {
      entry.decl.remove()
    }
  }

  const reorderGroups = new Map<string, Declaration[]>()

  for (const node of rule.nodes) {
    if (node.type !== 'decl') {
      continue
    }
    const canonical = getCanonicalProp(node.prop)
    if (!variablePriorityProps.has(canonical)) {
      continue
    }
    const existing = reorderGroups.get(canonical)
    if (existing) {
      existing.push(node)
    }
    else {
      reorderGroups.set(canonical, [node])
    }
  }

  for (const declarations of reorderGroups.values()) {
    if (declarations.length <= 1) {
      continue
    }

    reorderLiteralFirst(
      rule,
      declarations,
      decl => hasVariableReference(decl.value),
    )
  }

  const literalSeen = new Map<string, Declaration>()

  for (const node of [...rule.nodes]) {
    if (node.type !== 'decl') {
      continue
    }

    const canonical = getCanonicalProp(node.prop)
    if (!variablePriorityProps.has(canonical)) {
      continue
    }

    if (hasVariableReference(node.value)) {
      continue
    }

    const key = `${canonical}${node.important ? '!important' : ''}`
    const existing = literalSeen.get(key)
    if (existing) {
      if (existing.prop !== canonical && node.prop === canonical) {
        existing.remove()
        literalSeen.set(key, node)
      }
      else {
        node.remove()
      }
    }
    else {
      literalSeen.set(key, node)
    }
  }

  removeRedundantTransitionPropertyFallbacks(rule)

  // reorderVariableDeclarations(rule)
}
