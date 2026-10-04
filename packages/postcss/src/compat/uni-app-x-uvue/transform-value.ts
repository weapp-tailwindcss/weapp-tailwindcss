import valueParser from 'postcss-value-parser'
import { loadNativeCssBinding, nativeCssConfigured } from '../../native/binding'

export function normalizeUniAppXTransformValue(value: string) {
  if (!value.toLowerCase().includes('translate(') || !value.includes(',')) {
    return value
  }

  const native = nativeCssConfigured
    ? loadNativeCssBinding()?.normalizeUvueTransformValue(value)
    : undefined
  if (native !== undefined && native !== null) {
    return native
  }

  return legacyTransformValue(value)
}

function legacyTransformValue(value: string) {
  const parsed = valueParser(value)
  let changed = false

  parsed.walk((node) => {
    if (node.type !== 'function' || node.value.toLowerCase() !== 'translate') {
      return
    }

    for (const child of node.nodes) {
      if (child.type !== 'div' || child.value !== ',') {
        continue
      }

      child.value = ' '
      child.before = ''
      child.after = ''
      changed = true
    }
  })

  return changed ? parsed.toString() : value
}

/** 保持声明顺序，一次处理当前阶段的候选值；未闭合值逐条走兼容解析器。 */
export function normalizeUniAppXTransformValues(values: string[]) {
  const indexes: number[] = []
  const candidates: string[] = []
  values.forEach((value, index) => {
    if (value.toLowerCase().includes('translate(') && value.includes(',')) {
      indexes.push(index)
      candidates.push(value)
    }
  })
  if (candidates.length === 0) {
    return values
  }
  const native = nativeCssConfigured
    ? loadNativeCssBinding()?.normalizeUvueTransformValues(candidates)
    : undefined
  if (native && native.length !== candidates.length) {
    throw new Error('PostCSS Rust 内核返回了不完整的 transform 声明批次')
  }
  const output = [...values]
  candidates.forEach((value, index) => {
    output[indexes[index]!] = native?.[index] ?? legacyTransformValue(value)
  })
  return output
}
