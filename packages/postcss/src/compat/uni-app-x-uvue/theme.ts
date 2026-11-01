import type { Document, Root, Rule } from 'postcss'
import valueParser from 'postcss-value-parser'
import { isTailwindcssV4ThemeVariable } from '../tailwindcss-v4/variables'

const SYSTEM_ROOT_SELECTORS = new Set([
  ':host',
  ':root',
  '.tw-root',
  'page',
  'uni-page-body',
  'wx-root-portal-content',
])

function normalizeSelector(selector: string) {
  return selector.replace(/\s+/g, '').toLowerCase()
}

export function isUniAppXSystemRootCarrierRule(rule: Rule) {
  const selectors = rule.selectors ?? []
  if (selectors.length === 0) {
    return false
  }
  let hasRootMarker = false
  for (const selector of selectors) {
    const normalized = normalizeSelector(selector)
    if (!SYSTEM_ROOT_SELECTORS.has(normalized)) {
      return false
    }
    if (normalized === ':host' || normalized === ':root' || normalized === '.tw-root') {
      hasRootMarker = true
    }
  }
  return hasRootMarker
}

function resolveNodes(
  nodes: valueParser.Node[],
  variables: ReadonlyMap<string, string>,
  resolving: ReadonlySet<string>,
) {
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index]
    if (node?.type !== 'function') {
      continue
    }
    if (node.value.toLowerCase() !== 'var') {
      resolveNodes(node.nodes, variables, resolving)
      continue
    }

    const variable = node.nodes.find(child => child.type === 'word')
    if (variable?.type !== 'word' || !variable.value.startsWith('--')) {
      resolveNodes(node.nodes, variables, resolving)
      continue
    }

    const commaIndex = node.nodes.findIndex(child => child.type === 'div' && child.value === ',')
    const fallback = commaIndex >= 0
      ? valueParser.stringify(node.nodes.slice(commaIndex + 1)).trim()
      : ''
    const configured = variables.get(variable.value)
    let replacement: string | undefined

    if (configured !== undefined && !resolving.has(variable.value)) {
      replacement = resolveThemeValue(
        configured,
        variables,
        new Set([...resolving, variable.value]),
      )
    }
    else if (
      fallback
      && isTailwindcssV4ThemeVariable(variable.value)
    ) {
      replacement = resolveThemeValue(fallback, variables, resolving)
    }

    if (replacement === undefined) {
      resolveNodes(node.nodes, variables, resolving)
      continue
    }

    const replacementNodes = valueParser(replacement).nodes
    nodes.splice(index, 1, ...replacementNodes)
    index += replacementNodes.length - 1
  }
}

function resolveThemeValue(
  value: string,
  variables: ReadonlyMap<string, string>,
  resolving: ReadonlySet<string> = new Set(),
) {
  if (!value.includes('var(')) {
    return value
  }
  const parsed = valueParser(value)
  resolveNodes(parsed.nodes, variables, resolving)
  return parsed.toString()
}

function getUnresolvedAuthorVariableFallback(value: string) {
  const parsed = valueParser(value)
  const nodes = parsed.nodes.filter(node => node.type !== 'space' && node.type !== 'comment')
  const variable = nodes.length === 1 ? nodes[0] : undefined
  if (variable?.type !== 'function' || variable.value.toLowerCase() !== 'var') {
    return undefined
  }

  const variableNode = variable.nodes.find(node => node.type === 'word')
  const commaIndex = variable.nodes.findIndex(node => node.type === 'div' && node.value === ',')
  if (
    variableNode?.type !== 'word'
    || !variableNode.value.startsWith('--')
    || isTailwindcssV4ThemeVariable(variableNode.value)
    || variableNode.value.startsWith('--default-')
    || commaIndex < 0
  ) {
    return undefined
  }

  const fallback = valueParser.stringify(variable.nodes.slice(commaIndex + 1)).trim()
  if (!fallback) {
    return undefined
  }

  return {
    name: variableNode.value,
    fallback,
  }
}

/**
 * HBuilderX 不接受带 fallback 的 var() 声明，拆成静态 fallback 与动态变量两条声明。
 */
export function splitUnresolvedAuthorVariableFallbacks(
  root: Root | Document,
  variables: ReadonlyMap<string, string>,
) {
  if (typeof root.walkDecls !== 'function') {
    return false
  }

  let changed = false
  root.walkDecls((decl) => {
    if (decl.prop.startsWith('--')) {
      return
    }

    const unresolved = getUnresolvedAuthorVariableFallback(decl.value)
    if (!unresolved || variables.has(unresolved.name)) {
      return
    }

    decl.parent?.insertBefore(decl, decl.clone({ value: unresolved.fallback }))
    decl.value = `var(${unresolved.name})`
    changed = true
  })

  return changed
}

/**
 * UVUE 不支持 Tailwind 的混合根选择器，因此先把根作用域中的静态主题 token
 * 内联到实际 utility，再移除仅用于变量承载的系统规则。
 */
export function consumeUniAppXSystemRootTheme(
  root: Root,
  customPropertyValues?: ReadonlyMap<string, string>,
) {
  const carrierRules: Rule[] = []
  const variables = new Map(customPropertyValues)

  root.walkRules((rule) => {
    if (!isUniAppXSystemRootCarrierRule(rule)) {
      return
    }
    carrierRules.push(rule)
    rule.walkDecls((decl) => {
      if (decl.prop.startsWith('--')) {
        variables.set(decl.prop, decl.value)
      }
    })
  })

  if (variables.size > 0) {
    const carriers = new Set(carrierRules)
    root.walkDecls((decl) => {
      if (decl.parent?.type === 'rule' && carriers.has(decl.parent)) {
        return
      }
      decl.value = resolveThemeValue(decl.value, variables)
    })
  }

  splitUnresolvedAuthorVariableFallbacks(root, variables)

  for (const rule of carrierRules) {
    rule.remove()
  }
}
