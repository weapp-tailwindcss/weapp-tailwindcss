/* eslint-disable style/max-statements-per-line */

import type { AtRule } from 'postcss'
import type { NativePlatform, NativeStyleRule } from './types'

const CLASS_SELECTOR_RE = /\.((?:\\.|[^\s.#:[>+~])+)/g

function decodeCssIdentifier(value: string) {
  return value
    .replace(/\\([0-9a-f]{1,6})\s?/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/\\(.)/g, '$1')
}

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
    if (character === '[') { bracketDepth += 1 }
    if (character === ']') { bracketDepth = Math.max(0, bracketDepth - 1) }
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
  const classes: string[] = []
  for (const match of selector.matchAll(CLASS_SELECTOR_RE)) {
    const token = decodeCssIdentifier(match[1])
    if (token && !classes.includes(token)) { classes.push(token) }
  }
  return classes
}

export function variantForClass(className: string): Pick<NativeStyleRule, 'colorScheme' | 'platform'> {
  const result: Pick<NativeStyleRule, 'colorScheme' | 'platform'> = {}
  for (const variant of splitClassName(className).slice(0, -1)) {
    if (variant === 'dark') { result.colorScheme = 'dark' }
    if (variant === 'ios' || variant === 'android' || variant === 'native') { result.platform = variant as NativePlatform }
  }
  return result
}

export function atRuleVariant(node: AtRule | undefined): Pick<NativeStyleRule, 'colorScheme' | 'platform'> {
  if (!node) { return {} }
  const params = node.params.toLowerCase()
  if (params.includes('prefers-color-scheme') && params.includes('dark')) { return { colorScheme: 'dark' } }
  if (params.includes('platform') && params.includes('ios')) { return { platform: 'ios' } }
  if (params.includes('platform') && params.includes('android')) { return { platform: 'android' } }
  return {}
}
