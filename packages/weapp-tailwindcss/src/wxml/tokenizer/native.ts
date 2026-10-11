import type { Token } from './types'
import { loadNativeCompiler, nativeCompilerConfigured } from '../../native'

export function tokenizeWithNative(input: string): Token[] | undefined {
  if (!nativeCompilerConfigured) {
    return undefined
  }
  const compiler = loadNativeCompiler()
  if (!compiler) {
    return undefined
  }
  const spans = compiler.tokenizeWxml(input)
  const tokens: Token[] = []
  let offset = 0
  while (offset < spans.length) {
    const start = spans[offset++]!
    const end = spans[offset++]!
    const expressionCount = spans[offset++]!
    const expressions: Token['expressions'] = []
    for (let index = 0; index < expressionCount; index++) {
      const expressionStart = spans[offset++]!
      const expressionEnd = spans[offset++]!
      expressions.push({
        start: expressionStart,
        end: expressionEnd,
        value: input.slice(expressionStart, expressionEnd),
      })
    }
    tokens.push({ start, end, value: input.slice(start, end), expressions })
  }
  return tokens
}
