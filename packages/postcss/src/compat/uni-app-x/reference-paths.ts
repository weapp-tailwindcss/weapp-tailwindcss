import type { Root } from 'postcss'
import { parseUniAppXStyleSource } from '../../syntax/index'

/** 路径身份由调用端解析，本包只改写 reference 声明。 */
export function rewriteUniAppXStyleReferences(styleSource: string, resolveReference?: (request: string) => string) {
  let root: Root
  try {
    root = parseUniAppXStyleSource(styleSource)
  }
  catch {
    return styleSource
  }
  if (!resolveReference || !styleSource.includes('@reference')) {
    return root.toString()
  }
  root.walkAtRules('reference', (rule) => {
    const quote = rule.params[0]
    if (quote !== '"' && quote !== '\'') {
      return
    }
    const closingQuoteIndex = rule.params.indexOf(quote, 1)
    if (closingQuoteIndex <= 1) {
      return
    }
    const referencePath = rule.params.slice(1, closingQuoteIndex)
    if (!referencePath.startsWith('.')) {
      return
    }
    const resolvedPath = resolveReference(referencePath)
    rule.params = `${quote}${resolvedPath}${quote}${rule.params.slice(closingQuoteIndex + 1)}`
  })
  return root.toString()
}
