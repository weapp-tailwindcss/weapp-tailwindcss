import { describe, expect, it } from 'vitest'

import {
  COMPLEX_ESCAPE_MAPPING,
  createEscapeMapping,
  createInverseMapping,
  createTokenBuckets,
  createUnescapeMapping,
  DEFAULT_ESCAPE_KEYS,
  DEFAULT_ESCAPE_MAPPING,
  hasOwnKey,
  primeInverseCache,
} from '../src/mapping'

describe('mapping', () => {
  it('should merge custom escape map and cache the result', () => {
    const custom = { '!': '_bang' }
    const merged = createEscapeMapping(custom)

    expect(merged['!']).toBe('_bang')
    expect(merged['.']).toBe(DEFAULT_ESCAPE_MAPPING['.'])
    expect(createEscapeMapping(custom)).toBe(merged)
  })

  it('should fall back to default mapping when custom map is empty', () => {
    const empty: Record<string, string> = {}
    expect(createEscapeMapping(empty)).toBe(DEFAULT_ESCAPE_MAPPING)
  })

  it('should expose default escape keys for quick lookup', () => {
    expect(DEFAULT_ESCAPE_KEYS.has('.')).toBe(true)
    expect(DEFAULT_ESCAPE_KEYS.has('A')).toBe(false)
  })

  it('should provide sorted inverse mapping tokens', () => {
    const map = { a: '_', b: '__' }
    const { tokens, inverse } = createInverseMapping(map)
    const typedInverse = inverse as Record<'_' | '__', string>

    expect(tokens).toEqual(['__', '_'])
    expect(typedInverse._).toBe('a')
    expect(typedInverse.__).toBe('b')
  })

  it('should allow priming complex mapping cache without errors', () => {
    expect(() => {
      primeInverseCache(COMPLEX_ESCAPE_MAPPING)
      const { inverse } = createInverseMapping(COMPLEX_ESCAPE_MAPPING)
      const typedInverse = inverse as Record<'_ch', string>
      expect(typedInverse._ch).toBe('#')
    }).not.toThrow()
  })

  it('should return undefined token buckets when tokens are empty', () => {
    expect(createTokenBuckets({}, [])).toBeUndefined()
  })

  it('should keep unescape mapping identical to the custom value', () => {
    const map = { '[': '_l' }
    expect(createUnescapeMapping(map)).toBe(map)
    expect(createUnescapeMapping()).toBeUndefined()
  })

  it('hasOwnKey should honor prototype-less objects', () => {
    const obj = Object.create(null) as Record<'foo', string>
    obj.foo = 'bar'
    expect(hasOwnKey(obj, 'foo')).toBe(true)
    expect(hasOwnKey(obj, 'toString')).toBe(false)
  })
})
