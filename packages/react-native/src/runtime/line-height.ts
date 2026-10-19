export interface RelativeLineHeight {
  multiplier: number
  important: boolean
  fontSize?: number | undefined
  importantFontSize?: number | undefined
}

export function flattenInlineStyle(value: unknown, resolveRegistered?: (value: number) => Record<string, unknown> | undefined): Record<string, unknown> {
  const style: Record<string, unknown> = {}
  const active = new Set<unknown[]>()
  const pending: Array<{ value: unknown, exit?: boolean }> = [{ value }]
  while (pending.length) {
    const current = pending.pop()!
    if (Array.isArray(current.value)) {
      if (current.exit) {
        active.delete(current.value)
        continue
      }
      if (active.has(current.value)) {
        throw new Error('内联 style 数组包含循环引用')
      }
      active.add(current.value)
      pending.push({ value: current.value, exit: true })
      for (let index = current.value.length - 1; index >= 0; index--) {
        pending.push({ value: current.value[index] })
      }
    }
    else if (current.value && typeof current.value === 'object') {
      Object.assign(style, current.value)
    }
    else if (typeof current.value === 'number') {
      Object.assign(style, resolveRegistered?.(current.value))
    }
  }
  return style
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
