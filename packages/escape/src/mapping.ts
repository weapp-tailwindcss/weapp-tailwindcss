import {
  ComplexMappingChars2String,
  MappingChars2String,
} from './constants'

export type EscapeMapping = Record<string, string>

export const DEFAULT_ESCAPE_MAPPING = MappingChars2String as EscapeMapping
export const COMPLEX_ESCAPE_MAPPING = ComplexMappingChars2String as EscapeMapping
export const DEFAULT_ESCAPE_KEYS = new Set(Object.keys(DEFAULT_ESCAPE_MAPPING))

const escapeMappingCache = new WeakMap<EscapeMapping, EscapeMapping>()
const tokenBucketCache = new WeakMap<Record<string, string>, Record<string, string[]>>()

export interface InverseMappingResult {
  inverse: Record<string, string>
  tokens: string[]
}

const inverseMappingCache = new WeakMap<Record<string, string>, InverseMappingResult>()

export function hasOwnKey(object: Record<string, string>, key: string) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

export function createEscapeMapping(customMap?: Record<string, string>): EscapeMapping {
  if (!customMap) {
    return DEFAULT_ESCAPE_MAPPING
  }

  if (customMap === DEFAULT_ESCAPE_MAPPING || customMap === COMPLEX_ESCAPE_MAPPING) {
    return customMap
  }

  const cached = escapeMappingCache.get(customMap)
  if (cached) {
    return cached
  }

  if (Object.keys(customMap).length === 0) {
    escapeMappingCache.set(customMap, DEFAULT_ESCAPE_MAPPING)
    return DEFAULT_ESCAPE_MAPPING
  }

  const merged: EscapeMapping = { ...DEFAULT_ESCAPE_MAPPING, ...customMap }
  escapeMappingCache.set(customMap, merged)

  return merged
}

export function createUnescapeMapping(customMap?: Record<string, string>) {
  return customMap
}

function buildInverseMapping(mapping: Record<string, string>): InverseMappingResult {
  const inverse: Record<string, string> = {}
  const tokens = new Set<string>()

  for (const [key, value] of Object.entries(mapping)) {
    inverse[value] = key
    tokens.add(value)
  }

  const sortedTokens = Array.from(tokens).sort((a, b) => b.length - a.length)

  return { inverse, tokens: sortedTokens }
}

export function createInverseMapping(mapping: Record<string, string>) {
  const cached = inverseMappingCache.get(mapping)

  if (cached) {
    return cached
  }

  const built = buildInverseMapping(mapping)
  inverseMappingCache.set(mapping, built)

  return built
}

export function createTokenBuckets(mapping: Record<string, string>, tokens: string[]) {
  if (tokens.length === 0) {
    return undefined
  }

  const cached = tokenBucketCache.get(mapping)

  if (cached) {
    return cached
  }

  const buckets = tokens.reduce<Record<string, string[]>>((acc, token) => {
    if (!token) {
      return acc
    }

    const first = token[0]
    if (!first) {
      return acc
    }

    const bucket = acc[first]

    if (bucket) {
      bucket.push(token)
    }
    else {
      acc[first] = [token]
    }

    return acc
  }, {})

  tokenBucketCache.set(mapping, buckets)

  return buckets
}

export function primeInverseCache(mapping: Record<string, string>) {
  inverseMappingCache.set(mapping, buildInverseMapping(mapping))
}

primeInverseCache(DEFAULT_ESCAPE_MAPPING)
primeInverseCache(COMPLEX_ESCAPE_MAPPING)
