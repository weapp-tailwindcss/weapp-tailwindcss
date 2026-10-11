import { tokenize, TokenType } from '@csstools/css-tokenizer'
import valueParser from 'postcss-value-parser'
import { isCssVarFunction } from '../../utils/css-custom-property'

const ignoredTokenTypes = new Set<string>([TokenType.Whitespace, TokenType.Comment, TokenType.EOF])
const closingTokenTypes = new Set<string>([TokenType.CloseParen, TokenType.CloseSquare, TokenType.CloseCurly])

/** 完整检查 var 参数；未选中的 fallback 也不能含无效声明 token 或错误的嵌套 var。 */
export function readValidVariableName(node: valueParser.FunctionNode, depth = 0): string | undefined {
  if (node.unclosed || depth >= 64 || !isCssVarFunction(node.value)) {
    return undefined
  }
  const source = valueParser.stringify(node.nodes)
  if (source.length > 65_536) {
    return undefined
  }
  const tokens = tokenize({ css: source }).filter(token => !ignoredTokenTypes.has(token[0]))
  const first = tokens[0]
  if (first?.[0] !== TokenType.Ident || !first[4].value.startsWith('--') || first[4].value.length <= 2
    || (tokens.length > 1 && tokens[1]?.[0] !== TokenType.Comma)) {
    return undefined
  }
  const closing: string[] = []
  for (const token of tokens.slice(2)) {
    if (token[0] === TokenType.BadString || token[0] === TokenType.BadURL || token[0] === TokenType.Semicolon
      || (token[0] === TokenType.Delim && token[4].value === '!')) {
      return undefined
    }
    if (token[0] === TokenType.Function || token[0] === TokenType.OpenParen) {
      closing.push(TokenType.CloseParen)
    }
    else if (token[0] === TokenType.OpenSquare) {
      closing.push(TokenType.CloseSquare)
    }
    else if (token[0] === TokenType.OpenCurly) {
      closing.push(TokenType.CloseCurly)
    }
    else if (closingTokenTypes.has(token[0]) && closing.pop() !== token[0]) {
      return undefined
    }
  }
  if (closing.length > 0) {
    return undefined
  }
  const pending = [...node.nodes]
  while (pending.length > 0) {
    const child = pending.pop()!
    if ((child.type === 'function' || child.type === 'string') && child.unclosed) {
      return undefined
    }
    if (child.type === 'function') {
      if (isCssVarFunction(child.value)) {
        if (!readValidVariableName(child, depth + 1)) {
          return undefined
        }
      }
      else {
        pending.push(...child.nodes)
      }
    }
  }
  return first[4].value
}
