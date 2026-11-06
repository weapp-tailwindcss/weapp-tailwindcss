import type { FunctionNode } from 'postcss-value-parser'
import type { CssOptions } from '../../types'
import valueParser from 'postcss-value-parser'
import { resolveCustomPropertyVarValue } from '../web-css-custom-properties'
import { hasCompleteColorMixFunctions, normalizeDynamicColorMixAlpha } from './dynamic-alpha'
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
  options: Pick<CssOptions, 'colorMixDynamicAlpha'> = {},
): { value: string, deferred: boolean } | undefined {
  if (node.unclosed || !hasCompleteColorMixFunctions(node.nodes)) {
    return undefined
  }
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

  const alpha = parseAlphaValue(resolveCustomPropertyVarValue(alphaSource, customPropertyValues))
  if (alpha === undefined) {
    const value = options.colorMixDynamicAlpha === 'rgba'
      ? normalizeDynamicColorMixAlpha(colorSource, alphaNodes, customPropertyValues)
      : undefined
    return value ? { value, deferred: false } : undefined
  }

  const normalized = normalizeColorFunctionName(colorSource, alpha, customPropertyValues)
  if (normalized) {
    return { value: normalized, deferred: false }
  }

  return undefined
}
