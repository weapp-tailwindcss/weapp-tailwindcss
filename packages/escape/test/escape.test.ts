import { describe, expect, it } from 'vitest'

import {
  ComplexMappingChars2String as ComplexMap,
  MAX_ASCII_CHAR_CODE,
} from '../src/constants'
import { escape } from '../src/escape'

const testCase = `1234567890-=\b~!@#$%^&*()_+qwertyuiop[]\\QWERTYUIOP{}|asdfghjkl;'ASDFGHJKL:"zxcvbnm,./ZXCVBNM<>?`

describe('escape', () => {
  it('should match snapshot for default mapping', () => {
    expect(escape(testCase)).toMatchSnapshot()
  })

  it('should match snapshot for complex mapping', () => {
    expect(escape(testCase, { map: ComplexMap })).toMatchSnapshot()
  })

  it('should handle empty input', () => {
    expect(escape('')).toBe('')
  })

  it('should escape leading hyphen when needed', () => {
    expect(escape('-')).toBe('_-')
    expect(escape('-', { ignoreHead: true })).toBe('-')
  })

  it('should keep leading digits untouched when ignoreHead is true', () => {
    expect(escape('1abc', { ignoreHead: true })).toBe('1abc')
  })

  it('should escape leading hyphen followed by digits', () => {
    expect(escape('-12345')).toBe('_-12345')
    expect(escape('-12345', { ignoreHead: true })).toBe('-12345')
  })

  it('should leave hyphen followed by letters untouched', () => {
    expect(escape('-plmkoi')).toBe('-plmkoi')
    expect(escape('-plmkoi', { ignoreHead: true })).toBe('-plmkoi')
  })

  it('should escape mapped characters using custom map', () => {
    expect(escape('abc', { map: { a: 'A', b: 'B' } })).toBe('ABc')
  })

  it('should handle unmapped leading ascii when custom map is provided', () => {
    const map = { '[': 'customL' }
    expect(escape('b😊', { map })).toBe('bu_x1f60a_')
  })

  it('should escape leading digits when custom map is provided', () => {
    const map = { '[': 'customL' }
    expect(escape('1a', { map })).toBe('_1a')
  })

  it('should escape solo leading digits when custom map is provided', () => {
    const map = { '[': 'customL' }
    expect(escape('1', { map })).toBe('_1')
  })

  it('should escape unicode when using custom map', () => {
    const map = { a: 'A' }
    expect(escape('我们a', { map })).toBe('u_x6211_u_x4eec_A')
  })

  it('should handle surrogate pairs when custom map is used', () => {
    const map = { a: 'A' }
    expect(escape('a😊', { map })).toBe('Au_x1f60a_')
  })

  it('should return unicode escape sequences for non-ascii characters', () => {
    expect(escape('我爱你')).toBe('u_x6211_u_x7231_u_x4f60_')
    expect(escape('😊')).toBe('u_x1f60a_')
  })

  it('should encode the maximum unicode code point', () => {
    const maxCodePointChar = String.fromCodePoint(0x10FFFF)
    expect(escape(maxCodePointChar)).toBe('u_x10ffff_')
  })

  it('should handle surrogate pairs when peeking the second character', () => {
    expect(escape('a😊b')).toBe('au_x1f60a_b')
  })

  it('should handle unmatched surrogate halves', () => {
    expect(escape('\uD83D')).toBe('u_xd83d_')
  })

  it('should ignore surrogate pairing when the trailing unit is not low surrogate', () => {
    expect(escape('\uD83Da')).toBe('u_xd83d_a')
  })

  it('should escape contiguous mapped symbols', () => {
    expect(escape('[](){}')).toBe('_b_B_p_P_k_K')
  })

  it('should keep default tokens untouched when already escaped', () => {
    const token = '_b'
    expect(escape(token)).toBe(token)
  })

  it('should encode character immediately above ascii boundary', () => {
    const boundaryChar = String.fromCodePoint(MAX_ASCII_CHAR_CODE + 1)
    expect(escape(boundaryChar)).toBe(`u_x${(MAX_ASCII_CHAR_CODE + 1).toString(16)}_`)
  })

  it('should allow custom map entries to override defaults', () => {
    const map = { '[': 'customL', '!': 'customBang' }
    expect(escape('[!', { map })).toBe('customLcustomBang')
  })

  it('should respect custom mapping for leading hyphen', () => {
    const map = { '-': 'dash' }
    expect(escape('-1', { map })).toBe('dash1')
  })

  it('should reuse cached merged map', () => {
    const map = { '[': 'cachedL' }
    expect(escape('[', { map })).toBe('cachedL')
    expect(escape('[', { map })).toBe('cachedL')
  })

  it('should treat empty custom map as default mapping', () => {
    const empty: Record<string, string> = {}
    const source = '![#'
    expect(escape(source, { map: empty })).toBe(escape(source))
  })

  it('should keep default options when none provided', () => {
    expect(escape('abc')).toBe('abc')
  })

  it('should handle Tailwind arbitrary value syntax', () => {
    const source = 'bg-[var(--xx)]'
    const escaped = escape(source)
    expect(escaped).toBe('bg-_bvar_p--xx_P_B')
  })

  it('should handle Tailwind syntax with complex mapping', () => {
    const source = 'bg-[var(--xx)]'
    const escaped = escape(source, { map: ComplexMap })
    expect(escaped).toBe('bg-_cbvar_cp--xx_cP_cB')
  })
})
