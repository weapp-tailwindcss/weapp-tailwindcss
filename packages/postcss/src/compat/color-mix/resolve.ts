import type { FunctionNode } from 'postcss-value-parser'
import valueParser from 'postcss-value-parser'
import {
  normalizeColorFunctionName,
  parseAlphaValue,
  splitArguments,
  splitStopSegments,
  trimNodes,
} from './parse'

const RECTANGULAR_INTERPOLATION_RE = /^in\s+(?:srgb|srgb-linear|lab|oklab|xyz|xyz-d50|xyz-d65)$/i

export function tryResolveColorMix(
  node: FunctionNode,
  customPropertyValues: ReadonlyMap<string, string>,
): { value: string, deferred: boolean } | undefined {
  const args = splitArguments(node.nodes)
  if (args.length !== 3 || !RECTANGULAR_INTERPOLATION_RE.test(valueParser.stringify(args[0]!).trim())) {
    return undefined
  }

  const colorStopNodes = splitStopSegments(args[1] ?? [])
  if (colorStopNodes.length !== 2) {
    return undefined
  }

  const colorNodes = trimNodes(colorStopNodes[0] ?? [])
  const alphaNodes = trimNodes(colorStopNodes[1] ?? [])
  const trailingNodes = trimNodes(args[2] ?? [])
  if (!colorNodes.length || !alphaNodes.length || valueParser.stringify(trailingNodes).trim().toLowerCase() !== 'transparent') {
    return undefined
  }

  const colorSource = valueParser.stringify(colorNodes).trim()
  const alphaSource = valueParser.stringify(alphaNodes).trim()
  if (!colorSource || !alphaSource) {
    return undefined
  }

  const alpha = parseAlphaValue(alphaSource)
  if (alpha === undefined) {
    return undefined
  }

  const normalized = normalizeColorFunctionName(colorSource, alpha, customPropertyValues)
  if (normalized) {
    return { value: normalized, deferred: false }
  }

  return undefined
}
