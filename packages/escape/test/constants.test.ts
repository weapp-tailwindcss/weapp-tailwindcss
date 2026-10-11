import { describe, expect, it } from 'vitest'

import {
  ComplexMappingChars2String,
  ComplexMappingChars2StringEntries,
  MappingChars2String,
  MappingChars2StringEntries,
  SYMBOL_TABLE,
} from '../src/constants'

describe('constants', () => {
  it('should expose a stable symbol table snapshot', () => {
    expect(SYMBOL_TABLE.HASH).toBe('#')
    expect(Object.keys(SYMBOL_TABLE)).toContain('BACKSLASH')
  })

  it('should keep simple and complex mapping keys aligned', () => {
    const simpleKeys = MappingChars2StringEntries.map(entry => entry[0]).sort()
    const complexKeys = ComplexMappingChars2StringEntries.map(entry => entry[0]).sort()

    expect(simpleKeys).toEqual(complexKeys)
    expect(simpleKeys.length).toBeGreaterThan(0)
  })

  it('should generate unique tokens for both mappings', () => {
    const simpleTokens = new Set(Object.values(MappingChars2String))
    const complexTokens = new Set(Object.values(ComplexMappingChars2String))

    expect(simpleTokens.size).toBe(Object.keys(MappingChars2String).length)
    expect(complexTokens.size).toBe(Object.keys(ComplexMappingChars2String).length)
  })

  it('should prefix tokens appropriately', () => {
    for (const token of Object.values(MappingChars2String)) {
      expect(token.startsWith('_')).toBe(true)
      expect(token.length).toBe(2)
    }

    for (const token of Object.values(ComplexMappingChars2String)) {
      expect(token.startsWith('_c')).toBe(true)
      expect(token.length).toBe(3)
    }
  })
})
