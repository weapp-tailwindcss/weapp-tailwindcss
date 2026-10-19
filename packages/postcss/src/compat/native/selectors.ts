import type { AtRule, Rule } from 'postcss'
import type { NativePlatform, NativeStyleRule } from './types'
import selectorParser from 'postcss-selector-parser'

export function splitClassName(className: string) {
  const parts: string[] = []
  let current = ''
  let bracketDepth = 0
  let escaped = false
  for (const character of className) {
    if (escaped) {
      current += character
      escaped = false
      continue
    }
    if (character === '\\') {
      current += character
      escaped = true
      continue
    }
    if (character === '[') {
      bracketDepth += 1
    }
    if (character === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1)
    }
    if (character === ':' && bracketDepth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += character
  }
  parts.push(current)
  return parts
}

export function baseClassName(className: string) {
  return splitClassName(className).at(-1)
}

export function unsupportedVariant(className: string) {
  return splitClassName(className).slice(0, -1).find(variant => !['dark', 'ios', 'android', 'native'].includes(variant))
}

export function walkClasses(selector: string) {
  const classes = new Set<string>()
  selectorParser().astSync(selector).walkClasses((node) => {
    classes.add(node.value)
  })
  return [...classes]
}

/** 选择器只通过 AST 的精确 class 和 nesting 父级建立归属，不能猜测变体名称。 */
export function nativeSelectorCandidates(rule: Rule, allowed?: Set<string>): Array<{ className: string, supported: boolean }> {
  const result: Array<{ className: string, supported: boolean }> = []
  const ast = selectorParser().astSync(rule.selector)
  for (const selector of ast.nodes) {
    const classes = new Set<string>()
    let nested = false
    selector.walkClasses((node) => {
      classes.add(node.value)
    })
    selector.walkNesting(() => {
      nested = true
    })
    const parents = nested && rule.parent?.type === 'rule'
      ? nativeSelectorCandidates(rule.parent, allowed)
      : []
    for (const parent of parents) {
      classes.add(parent.className)
    }
    const nodes = selector.nodes.filter(node => node.type !== 'comment')
    for (const className of classes) {
      if (allowed && !allowed.has(className)) {
        continue
      }
      const supported = nodes.length === 1 && (
        (nodes[0]?.type === 'class' && nodes[0].value === className)
        || (nodes[0]?.type === 'nesting' && parents.some(parent => parent.className === className && parent.supported))
      )
      result.push({ className, supported })
    }
  }
  return result
}

export function variantForClass(className: string): Pick<NativeStyleRule, 'colorScheme' | 'platform'> {
  const result: Pick<NativeStyleRule, 'colorScheme' | 'platform'> = {}
  for (const variant of splitClassName(className).slice(0, -1)) {
    if (variant === 'dark') {
      result.colorScheme = 'dark'
    }
    if (variant === 'ios' || variant === 'android' || variant === 'native') {
      result.platform = variant as NativePlatform
    }
  }
  return result
}

export function atRuleVariant(node: AtRule | undefined): Pick<NativeStyleRule, 'colorScheme' | 'platform'> {
  if (!node) {
    return {}
  }
  const params = node.params.toLowerCase()
  if (params.includes('prefers-color-scheme') && params.includes('dark')) {
    return { colorScheme: 'dark' }
  }
  if (params.includes('platform') && params.includes('ios')) {
    return { platform: 'ios' }
  }
  if (params.includes('platform') && params.includes('android')) {
    return { platform: 'android' }
  }
  return {}
}
