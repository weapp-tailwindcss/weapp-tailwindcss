import type { BareArbitraryValueOptions, BareArbitraryValueResolveResult } from './types.ts'
import { isBalancedBareArbitraryBody, isBalancedFunctionValue, isEscapedAt, isHexColorValue, isQuotedValue, normalizeEscapedValue, splitVariantPrefix } from './syntax.ts'

const DEFAULT_BARE_ARBITRARY_VALUE_UNITS = [
  '%',
  'px',
  'rpx',
  'rem',
  'em',
  'vw',
  'vh',
  'vmin',
  'vmax',
  'dvw',
  'dvh',
  'svw',
  'svh',
  'lvw',
  'lvh',
  'ch',
  'ex',
  'lh',
  'rlh',
  'fr',
  'deg',
  'rad',
  'turn',
  's',
  'ms',
]

const NUMBER_RE = /^-?(?:\d+|\d*\.\d+)$/
const FUNCTION_VALUE_RE = /^[a-z_-][\w-]*\(/i
const ASPECT_RATIO_RE = /^\d+\/\d+$/

function normalizeBareArbitraryValueOptions(options: boolean | BareArbitraryValueOptions | undefined) {
  if (options === false || options === undefined || options === null) {
    return
  }

  const units = options === true ? DEFAULT_BARE_ARBITRARY_VALUE_UNITS : options.units ?? DEFAULT_BARE_ARBITRARY_VALUE_UNITS
  const normalizedUnits = [...new Set(units.filter(unit => typeof unit === 'string' && unit.length > 0))]
  if (normalizedUnits.length === 0) {
    return
  }
  return {
    units: normalizedUnits.sort((a, b) => b.length - a.length),
  }
}

export function isBareArbitraryValuesEnabled(options: boolean | BareArbitraryValueOptions | undefined) {
  return normalizeBareArbitraryValueOptions(options) !== undefined
}

function resolveValueWithUnit(body: string, units: string[]) {
  const value = normalizeEscapedValue(body)
  for (const unit of units) {
    if (!value.endsWith(unit)) {
      continue
    }
    const numberPart = value.slice(0, -unit.length)
    if (NUMBER_RE.test(numberPart)) {
      return `${numberPart}${unit}`
    }
  }
}

function resolveArbitraryValue(utility: string, body: string, units: string[]) {
  const value = normalizeEscapedValue(body)
  const withUnit = resolveValueWithUnit(value, units)
  if (withUnit) {
    return withUnit
  }

  if (utility === 'aspect' && ASPECT_RATIO_RE.test(value)) {
    return value
  }

  if (isHexColorValue(value)) {
    return value
  }

  if (isQuotedValue(value)) {
    return value
  }

  if (FUNCTION_VALUE_RE.test(value) && value.endsWith(')') && isBalancedFunctionValue(value)) {
    if (utility === 'text' && /^var\(/i.test(value)) {
      return `color:${value}`
    }
    return value
  }
}

function resolveUtilityAndValue(body: string, units: string[]) {
  let depth = 0
  let quote: string | undefined

  for (let index = body.length - 1; index > 0; index--) {
    const character = body[index]

    if (isEscapedAt(body, index)) {
      continue
    }

    if (quote) {
      if (character === quote) {
        quote = undefined
      }
      continue
    }

    if (character === '"' || character === '\'') {
      quote = character
      continue
    }

    if (character === ')' || character === '}') {
      depth++
      continue
    }

    if (character === '(' || character === '{') {
      depth = Math.max(0, depth - 1)
      continue
    }

    if (depth > 0 || character !== '-') {
      continue
    }

    const utility = body.slice(0, index)
    const rawValue = body.slice(index + 1)
    if (!utility || !rawValue) {
      continue
    }

    const value = resolveArbitraryValue(utility, rawValue, units)
    if (value) {
      return {
        utility,
        value,
      }
    }
  }
}

export function resolveBareArbitraryValueCandidate(
  candidate: string,
  options?: boolean | BareArbitraryValueOptions,
): BareArbitraryValueResolveResult | undefined {
  const normalizedOptions = normalizeBareArbitraryValueOptions(options)
  if (!normalizedOptions || !candidate || candidate.includes('[') || candidate.includes(']')) {
    return
  }

  const { prefix, body } = splitVariantPrefix(candidate)
  const important = body.startsWith('!') ? '!' : ''
  let normalizedBody = important ? body.slice(1) : body
  const negative = normalizedBody.startsWith('-') ? '-' : ''
  if (negative) {
    normalizedBody = normalizedBody.slice(1)
  }
  if (!isBalancedBareArbitraryBody(normalizedBody)) {
    return
  }

  const resolved = resolveUtilityAndValue(normalizedBody, normalizedOptions.units)
  if (!resolved) {
    return
  }

  return {
    candidate,
    canonicalCandidate: `${prefix}${important}${negative}${resolved.utility}-[${resolved.value}]`,
  }
}
