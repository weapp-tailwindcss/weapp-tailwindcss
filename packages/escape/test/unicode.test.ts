import { describe, expect, it } from 'vitest'

import { decodeUnicodeSequence } from '../src/unicode'

describe('unicode helpers', () => {
  it('should decode unicode sequences beyond ASCII range', () => {
    expect(decodeUnicodeSequence('u_x4f60_', 0)).toEqual({ char: '你', length: 8 })
  })

  it('should ignore invalid prefixes or ascii code points', () => {
    expect(decodeUnicodeSequence('foo', 0)).toBeUndefined()
    expect(decodeUnicodeSequence('u_x41_', 0)).toBeUndefined()
  })

  it('should handle boundary unicode sequences', () => {
    expect(decodeUnicodeSequence('u_x80_', 0)).toEqual({ char: '\u0080', length: 6 })
    expect(decodeUnicodeSequence('u_x10ffff_', 0)).toEqual({ char: '\u{10FFFF}', length: 10 })
    expect(decodeUnicodeSequence('u_x110000_', 0)).toBeUndefined()
  })

  it('should require a trailing underscore', () => {
    expect(decodeUnicodeSequence('u_x1f60a', 0)).toBeUndefined()
  })

  it('should require at least one hex digit', () => {
    expect(decodeUnicodeSequence('u_x_', 0)).toBeUndefined()
  })

  it('should decode uppercase hex digits', () => {
    expect(decodeUnicodeSequence('u_x00AF_', 0)).toEqual({ char: '\u00AF', length: 8 })
  })
})
