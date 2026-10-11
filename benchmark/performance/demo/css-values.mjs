import { color } from '@csstools/css-color-parser'
import { parseComponentValue } from '@csstools/css-parser-algorithms'
import { tokenize, TokenType } from '@csstools/css-tokenizer'

export function canonicalCssValue(value) {
  const tokens = tokenize({ css: value })
  const node = parseComponentValue(tokens)
  const parsedColor = node && color(node)
  // 不做色域裁剪或近似容差；只统一同一个颜色的序列化写法。
  if (parsedColor && ['hex', 'rgb'].includes(parsedColor.colorNotation)) return JSON.stringify({ srgb: parsedColor.channels, alpha: parsedColor.alpha })
  return tokens.map(token => {
    if (token[0] === TokenType.Dimension) return `${token[4].value}${token[4].unit}`
    if (token[0] === TokenType.Number) return String(token[4].value)
    if (token[0] === TokenType.Percentage) return `${token[4].value}%`
    return token[1]
  }).join('')
}

export function canonicalStyleEvidence(result) {
  if (!result || typeof result !== 'object') return result
  if (Array.isArray(result)) return result.map(canonicalStyleEvidence)
  return Object.fromEntries(Object.entries(result).filter(([key]) => key !== 'comparisonProbes').map(([key, original]) => {
    const value = key === 'probes' && result.comparisonProbes ? result.comparisonProbes : original
    if (key === 'rules') return [key, Object.fromEntries(Object.entries(value).map(([name, values]) => [name, [...new Set(values.map(canonicalCssValue))].sort()]))]
    if (key === 'spacing') return [key, [...new Set(value.map(canonicalCssValue))].sort()]
    return [key, canonicalStyleEvidence(value)]
  }))
}
