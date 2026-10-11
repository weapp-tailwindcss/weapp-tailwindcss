import { describe, expect, it } from 'vitest'

import {
  __areExportsLoaded,
  ComplexMappingChars2StringEntries,
  escape,
  isAllowedClassName,
  isAsciiNumber,
  MappingChars2StringEntries,
  unescape,
} from '@/index'

describe('index exports', () => {
  it('should expose matching mapping entry counts', () => {
    expect(__areExportsLoaded).toBe(true)
    expect(ComplexMappingChars2StringEntries.length).toBe(MappingChars2StringEntries.length)
  })

  it('should re-export predicate helpers', () => {
    expect(isAsciiNumber('9'.codePointAt(0)!)).toBe(true)
    expect(isAllowedClassName('foo-bar')).toBe(true)
    expect(isAllowedClassName('foo bar')).toBe(false)
  })

  it('should re-export escape and unescape pair', () => {
    const escaped = escape('1abc')
    expect(escaped).toBe('_1abc')
    expect(unescape(escaped)).toBe('1abc')
  })
})
