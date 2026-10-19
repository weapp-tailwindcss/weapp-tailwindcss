import type { ColorData } from '@csstools/css-color-parser'
import type { Node } from 'postcss-value-parser'
import { color as parseColor, serializeRGB } from '@csstools/css-color-parser'
import { parseComponentValue } from '@csstools/css-parser-algorithms'
import { tokenize } from '@csstools/css-tokenizer'
import valueParser from 'postcss-value-parser'
import {
  CSS_WIDE_KEYWORD_RE,
  CURRENT_COLOR_RE,
  CUSTOM_PROPERTY_RE,
  TRANSPARENT_COLOR_RE,
} from './constants'

export function splitArguments(nodes: Node[]) {
  const args: Node[][] = []
  let current: Node[] = []

  for (const node of nodes) {
    if (node.type === 'div' && node.value === ',') {
      args.push(current)
      current = []
      continue
    }
    current.push(node)
  }

  args.push(current)
  return args
}

export function splitStopSegments(nodes: Node[]) {
  const segments: Node[][] = []
  let current: Node[] = []

  for (const node of nodes) {
    if (node.type === 'space') {
      if (current.length > 0) {
        segments.push(current)
        current = []
      }
      continue
    }
    current.push(node)
  }

  if (current.length > 0) {
    segments.push(current)
  }
  return segments
}

export function trimNodes(nodes: Node[]) {
  let start = 0
  let end = nodes.length

  while (start < end && nodes[start]?.type === 'space') {
    start += 1
  }

  while (end > start && nodes[end - 1]?.type === 'space') {
    end -= 1
  }

  return nodes.slice(start, end)
}

function getParsedColorData(colorSource: string) {
  try {
    const parsed = parseComponentValue(tokenize({ css: colorSource }))
    return parsed ? parseColor(parsed) : false
  }
  catch {
    return false
  }
}

export function parseAlphaValue(alphaSource: string) {
  const parsed = Number.parseFloat(alphaSource)
  if (Number.isFinite(parsed)) {
    return alphaSource.trim().endsWith('%') ? parsed / 100 : parsed
  }
  return undefined
}

function resolveVarColor(
  colorSource: string,
  customPropertyValues: ReadonlyMap<string, string>,
  depth = 0,
): ColorData | undefined {
  if (depth > 5) {
    return undefined
  }

  const parsed = valueParser(colorSource.trim())
  const node = parsed.nodes.length === 1 ? parsed.nodes[0] : undefined
  if (node?.type !== 'function' || node.value.toLowerCase() !== 'var') {
    return undefined
  }

  const args = splitArguments(node.nodes)
  const propertyName = valueParser.stringify(trimNodes(args[0] ?? [])).trim()
  if (!CUSTOM_PROPERTY_RE.test(propertyName)) {
    return undefined
  }

  const resolved = customPropertyValues.get(propertyName)
  if (!resolved) {
    const fallback = args[1] ? valueParser.stringify(trimNodes(args[1])).trim() : undefined
    return fallback ? resolveColorData(fallback, customPropertyValues, depth + 1) : undefined
  }

  return resolveColorData(resolved, customPropertyValues, depth + 1)
}

export function resolveColorData(
  colorSource: string,
  customPropertyValues: ReadonlyMap<string, string>,
  depth = 0,
): ColorData | undefined {
  if (typeof colorSource !== 'string') {
    return undefined
  }
  const trimmed = colorSource.trim()
  if (TRANSPARENT_COLOR_RE.test(trimmed)) {
    const parsed = getParsedColorData(trimmed)
    return parsed || undefined
  }
  if (CURRENT_COLOR_RE.test(trimmed) || CSS_WIDE_KEYWORD_RE.test(trimmed)) {
    return undefined
  }

  const resolvedVar = resolveVarColor(trimmed, customPropertyValues, depth)
  if (resolvedVar) {
    return resolvedVar
  }

  return getParsedColorData(trimmed) || undefined
}

export function normalizeColorFunctionName(
  colorSource: string,
  alpha: number,
  customPropertyValues: ReadonlyMap<string, string>,
) {
  const resolvedColor = resolveColorData(colorSource, customPropertyValues)
  if (!resolvedColor) {
    return undefined
  }

  resolvedColor.alpha = alpha
  return serializeRGB(resolvedColor).toString()
}

export function normalizeColorFunctionWithDynamicAlpha(
  colorSource: string,
  alphaSource: string,
  customPropertyValues: ReadonlyMap<string, string>,
) {
  const resolvedColor = resolveColorData(colorSource, customPropertyValues)
  const alphaColor = getParsedColorData(`rgb(0 0 0 / ${alphaSource})`)
  if (!resolvedColor || !alphaColor || typeof alphaColor.alpha === 'number') {
    return undefined
  }

  resolvedColor.alpha = alphaColor.alpha
  return serializeRGB(resolvedColor).toString()
}

export function normalizeStandaloneColorFunction(colorSource: string, options: { preserveAlpha?: boolean } = {}) {
  const resolvedColor = getParsedColorData(colorSource)
  if (!resolvedColor) {
    return undefined
  }
  if (!options.preserveAlpha || typeof resolvedColor.alpha !== 'number' || resolvedColor.alpha >= 1) {
    return serializeRGB(resolvedColor).toString()
  }
  const opaque = valueParser(serializeRGB({ ...resolvedColor, alpha: 1 }).toString())
  const node = opaque.nodes[0]
  if (node?.type !== 'function') {
    return undefined
  }
  node.value = 'rgba'
  const alpha = Math.max(0, resolvedColor.alpha)
  const alphaSource = String(alpha).replace(/^(\d)(?:\.(\d+))?e-(\d+)$/, (_, integer: string, decimals: string | undefined, exponent: string) => `0.${'0'.repeat(Number(exponent) - 1)}${integer}${decimals ?? ''}`)
  node.nodes.push(...valueParser(`, ${alphaSource}`).nodes)
  return opaque.toString()
}
