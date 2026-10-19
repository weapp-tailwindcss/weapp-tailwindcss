export interface RelativeLineHeight {
  multiplier: number
  important: boolean
  fontSize?: number | undefined
  importantFontSize?: number | undefined
}

export function flattenInlineStyle(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    return Object.assign({}, ...value.map(flattenInlineStyle))
  }
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

/** 字号级联完成后再计算；继承字号未知时不猜测平台默认值。 */
export function relativeLineHeightStyle(relative: RelativeLineHeight | undefined, inline?: unknown) {
  if (!relative) {
    return undefined
  }
  const style = flattenInlineStyle(inline)
  if (style.lineHeight !== undefined && !relative.important) {
    return undefined
  }
  const fontSize = relative.importantFontSize ?? style.fontSize ?? relative.fontSize
  return typeof fontSize === 'number' && Number.isFinite(fontSize) && fontSize >= 0
    ? { lineHeight: fontSize * relative.multiplier }
    : undefined
}
