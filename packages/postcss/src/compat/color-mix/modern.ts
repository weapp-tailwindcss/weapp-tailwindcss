import type { FunctionNode, ParsedValue } from 'postcss-value-parser'
import valueParser from 'postcss-value-parser'
import {
  COLOR_MIX_NAME,
  MODERN_COLOR_FUNCTION_NAMES,
  MODERN_COLOR_SYNTAX_FUNCTION_NAMES,
} from './constants'

export function isDisplayP3ColorFunction(colorSource: string) {
  return /^color\(\s*display-p3\b/i.test(colorSource.trim())
}

export function isModernColorSyntaxFunction(colorSource: string) {
  const parsed = valueParser(colorSource.trim())
  const node = parsed.nodes.length === 1 ? parsed.nodes[0] : undefined
  return node?.type === 'function' && isModernColorSyntaxNode(node)
}

export function isModernColorSyntaxNode(node: FunctionNode) {
  const name = node.value.toLowerCase()
  if (!MODERN_COLOR_SYNTAX_FUNCTION_NAMES.has(name)) {
    return false
  }
  return !node.nodes.some(child => child.type === 'div' && child.value === ',')
}

const MODERN_COLOR_FUNCTION_RE = new RegExp(`(?:${[
  COLOR_MIX_NAME,
  ...MODERN_COLOR_FUNCTION_NAMES,
  ...MODERN_COLOR_SYNTAX_FUNCTION_NAMES,
  'color',
].join('|')})\\(`, 'i')

export function mayHaveModernColorFunction(value: string) {
  // 转义一律交给语法解析；预筛只排除明确不含目标函数的声明。
  return value.includes('\\') || MODERN_COLOR_FUNCTION_RE.test(value)
}

export function hasUnsupportedModernColorFunction(value: string) {
  return mayHaveModernColorFunction(value)
    && hasUnsupportedModernColorNodes(valueParser(value))
}

export function hasUnsupportedModernColorNodes(parsed: ParsedValue) {
  let hasUnsupported = false

  parsed.walk((node) => {
    if (node.type !== 'function') {
      return
    }
    const name = node.value.toLowerCase()
    if (
      name === COLOR_MIX_NAME
      || MODERN_COLOR_FUNCTION_NAMES.has(name)
      || (name === 'color' && isDisplayP3ColorFunction(valueParser.stringify(node)))
      || isModernColorSyntaxNode(node)
    ) {
      hasUnsupported = true
      return false
    }
  })

  return hasUnsupported
}
