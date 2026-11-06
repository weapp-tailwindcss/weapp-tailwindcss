import type { FunctionNode, ParsedValue } from 'postcss-value-parser'
import { tokenize, TokenType } from '@csstools/css-tokenizer'
import valueParser from 'postcss-value-parser'
import { decodeCssIdentifier } from '../../utils/css-custom-property'
import {
  COLOR_MIX_NAME,
  MODERN_COLOR_FUNCTION_NAMES,
  MODERN_COLOR_SYNTAX_FUNCTION_NAMES,
} from './constants'

export function isDisplayP3ColorFunction(colorSource: string) {
  if (!colorSource.includes('\\')) {
    return /^color\(\s*display-p3\b/i.test(colorSource.trim())
  }
  const tokens = tokenize({ css: colorSource }).filter(token => token[0] !== TokenType.Whitespace && token[0] !== TokenType.Comment)
  return tokens[0]?.[0] === TokenType.Function && tokens[0][4].value.toLowerCase() === 'color'
    && tokens[1]?.[0] === TokenType.Ident && tokens[1][4].value.toLowerCase() === 'display-p3'
}

export function isModernColorSyntaxFunction(colorSource: string) {
  const parsed = valueParser(colorSource.trim())
  const node = parsed.nodes.length === 1 ? parsed.nodes[0] : undefined
  return node?.type === 'function' && isModernColorSyntaxNode(node)
}

export function isModernColorSyntaxNode(node: FunctionNode) {
  const name = decodeCssIdentifier(node.value)?.toLowerCase() ?? ''
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
  if (!mayHaveModernColorFunction(value)) {
    return false
  }
  const parsed = valueParser(value)
  if (value.includes('\\')) {
    // 转义终止空白可能被 value-parser 拆开，按 token 身份拒绝隐藏的现代颜色。
    const tokens = tokenize({ css: value }).filter(token => token[0] !== TokenType.Whitespace && token[0] !== TokenType.Comment)
    if (tokens.some((token, index) => {
      if (token[0] !== TokenType.Function) {
        return false
      }
      const name = token[4].value.toLowerCase()
      const next = tokens[index + 1]
      if (MODERN_COLOR_SYNTAX_FUNCTION_NAMES.has(name)) {
        let depth = 1
        let comma = false
        for (const child of tokens.slice(index + 1)) {
          if (child[0] === TokenType.Function || child[0] === TokenType.OpenParen) {
            depth++
          }
          else if (child[0] === TokenType.CloseParen && --depth === 0) {
            break
          }
          else if (child[0] === TokenType.Comma && depth === 1) {
            comma = true
          }
        }
        if (!comma) {
          return true
        }
      }
      return name === COLOR_MIX_NAME || MODERN_COLOR_FUNCTION_NAMES.has(name)
        || (name === 'color' && next?.[0] === TokenType.Ident && next[4].value.toLowerCase() === 'display-p3')
    })) {
      return true
    }
  }
  return hasUnsupportedModernColorNodes(parsed)
}

export function hasUnsupportedModernColorNodes(parsed: ParsedValue) {
  let hasUnsupported = false

  parsed.walk((node) => {
    if (node.type !== 'function') {
      return
    }
    const name = decodeCssIdentifier(node.value)?.toLowerCase() ?? ''
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
