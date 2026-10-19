/** 默认 preset-env 与小程序前缀策略的独立冻结合同，不调用产品转换器。 */
export interface KeywordDeclaration {
  property: string
  value: string
}

const removedKeywordPrefixes: ReadonlySet<string> = new Set(['-webkit-user-select', '-webkit-hyphens', '-webkit-box-decoration-break'])

/** 只处理 properties.ts 已审查的字面量；所有未列明值先由调用方拒绝。 */
export function reviewedKeywordCompatibility(property: string, value: string): KeywordDeclaration[] {
  const declaration = { property, value }
  if (removedKeywordPrefixes.has(property)) {
    return []
  }
  if (property === 'overflow-wrap') {
    return [{ property: 'word-wrap', value }]
  }
  if (property === 'opacity' && value.endsWith('%')) {
    return [{ property, value: String(Number.parseFloat(value) / 100) }]
  }
  if (property === 'text-align' && (value === 'start' || value === 'end')) {
    return [{ property, value: value === 'start' ? 'left' : 'right' }]
  }
  if (property === 'inset') {
    return ['top', 'right', 'bottom', 'left'].map(property => ({ property, value }))
  }
  if (property === 'background-clip' && value === 'text') {
    return [{ property: '-webkit-background-clip', value }, declaration]
  }
  if (property === 'font-variant-numeric' && value === 'normal') {
    return [{ property: 'font-feature-settings', value }, declaration]
  }
  if (['break-before', 'break-after', 'break-inside'].includes(property) && !value.includes('column')) {
    return [{ property: `page-${property}`, value: value === 'page' ? 'always' : value === 'avoid-page' ? 'avoid' : value }, declaration]
  }
  if (property.startsWith('place-')) {
    const kind = property.slice('place-'.length)
    // 已审查值仅含一个完整对齐值组；基线 content 的缺省第二值由 CSS Alignment 定义为 start。
    const justify = kind === 'content' && value === 'baseline' ? 'start' : value
    return [{ property: `align-${kind}`, value }, { property: `justify-${kind}`, value: justify }, declaration]
  }
  return [declaration]
}
