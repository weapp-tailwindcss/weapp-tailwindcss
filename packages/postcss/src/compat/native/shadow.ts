/* eslint-disable style/max-statements-per-line */

import type { Node } from 'postcss-value-parser'
import valueParser from 'postcss-value-parser'
import { parseNativeShadowLength } from './length'
import { isColor, normalizeColor } from './values'

export interface NativeBoxShadow {
  offsetX: number
  offsetY: number
  blurRadius: number
  spreadDistance: number
  color: string
  inset?: boolean
}

function parseLayer(nodes: Node[], currentColor?: string): NativeBoxShadow | undefined {
  const lengths: number[] = []
  let color: string | undefined
  let inset: boolean | undefined
  let lengthsEnded = false
  for (const node of nodes) {
    if (node.type === 'space' || node.type === 'comment') { continue }
    const token = valueParser.stringify(node)
    if (token === 'inset') {
      if (inset) { return undefined }
      inset = true
      if (lengths.length) { lengthsEnded = true }
      continue
    }
    if (isColor(token)) {
      if (color !== undefined) { return undefined }
      color = normalizeColor(token.toLowerCase() === 'currentcolor' ? currentColor ?? '' : token)
      if (color === undefined) { return undefined }
      if (lengths.length) { lengthsEnded = true }
      continue
    }
    if (lengthsEnded || lengths.length === 4) { return undefined }
    const number = parseNativeShadowLength(token)
    if (typeof number !== 'number' || !Number.isFinite(number)) { return undefined }
    lengths.push(number)
  }
  color ??= currentColor ? normalizeColor(currentColor) : undefined
  if (lengths.length < 2 || (lengths[2] ?? 0) < 0 || color === undefined) { return undefined }
  return {
    offsetX: lengths[0]!,
    offsetY: lengths[1]!,
    blurRadius: lengths[2] ?? 0,
    spreadDistance: lengths[3] ?? 0,
    color,
    ...(inset ? { inset } : {}),
  }
}

/** 保留顶层逗号与颜色函数边界，完整编码每一层阴影，禁止静默取首层。 */
export function parseNativeBoxShadow(value: string, currentColor?: string): NativeBoxShadow[] | undefined {
  if (value.trim() === 'none') { return [] }
  const result: NativeBoxShadow[] = []
  let layer: Node[] = []
  for (const node of valueParser(value).nodes) {
    if (node.type === 'div' && node.value === ',') {
      const parsed = parseLayer(layer, currentColor)
      if (!parsed) { return undefined }
      result.push(parsed)
      layer = []
    }
    else { layer.push(node) }
  }
  const parsed = parseLayer(layer, currentColor)
  if (!parsed) { return undefined }
  result.push(parsed)
  // 全透明层不参与绘制，移除 Tailwind 属性默认占位不会改变阴影合成顺序。
  return result.filter(shadow => !/^(?:transparent|#(?:[\da-f]{3}0|[\da-f]{6}00)|rgba\([^,]+,[^,]+,[^,]+,\s*0(?:\.0+)?\))$/i.test(shadow.color))
}
