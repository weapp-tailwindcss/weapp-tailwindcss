import { describe, expect, it } from 'vitest'

import { MappingChars2String as ComplexMap } from '../src/constants'
import { escape } from '../src/escape'
import { unescape } from '../src/unescape'

describe('unescape', () => {
  it('should return an empty string when input is empty', () => {
    expect(unescape('')).toBe('')
  })

  it('should restore unicode sequences', () => {
    const escaped = escape('我爱你😊')
    expect(unescape(escaped)).toBe('我爱你😊')
  })

  it('should restore mapped characters with the same map', () => {
    const source = 'p-[2px]'
    const escaped = escape(source, { map: ComplexMap })
    expect(unescape(escaped, { map: ComplexMap })).toBe(source)
  })

  it('should restore leading digits', () => {
    const escaped = escape('1abc')
    expect(unescape(escaped)).toBe('1abc')
  })

  it('should handle dangling leading underscore', () => {
    expect(unescape('_')).toBe('')
  })

  it('should keep non-hex unicode markers untouched', () => {
    expect(unescape('u_x-')).toBe('u_x-')
  })

  it('should ignore ascii unicode escapes', () => {
    expect(unescape('u_x61_')).toBe('u_x61_')
  })

  it('should decode uppercase unicode sequences', () => {
    expect(unescape('u_x00AF_')).toBe('\u00AF')
  })

  it('should restore leading hyphen cases', () => {
    expect(unescape(escape('-'))).toBe('-')
    expect(unescape(escape('-123'))).toBe('-123')
  })

  it('should respect ignoreHead option', () => {
    const source = '-123'
    const escaped = escape(source, { ignoreHead: true })
    expect(unescape(escaped, { ignoreHead: true })).toBe(source)
  })

  it('should preserve genuine leading underscores', () => {
    expect(unescape('_abc')).toBe('_abc')
  })

  it('should strip artificial underscore before digits when provided via map', () => {
    const map = { _: 'x' }
    const escaped = escape('_1abc', { map })
    expect(escaped).toBe('x1abc')
    expect(unescape(escaped, { map })).toBe('1abc')
  })

  it('should strip artificial underscore before hyphen sequences from map output', () => {
    const map = { _: 'x' }
    const escaped = escape('_-1', { map })
    expect(escaped).toBe('x-1')
    expect(unescape(escaped, { map })).toBe('-1')
  })

  it('should retain artificial underscore when hyphen is followed by letters', () => {
    const map = { _: 'x' }
    const escaped = escape('_-ab', { map })
    expect(escaped).toBe('x-ab')
    expect(unescape(escaped, { map })).toBe('_-ab')
  })

  it('should keep encoded hyphen sequences without map when followed by letters', () => {
    expect(unescape('_-ab')).toBe('_-ab')
  })

  it('should decode leading hyphen sequences when map is provided but empty', () => {
    expect(unescape('_-1', { map: {} })).toBe('-1')
  })

  it('should strip leading underscores before digits when map is provided', () => {
    expect(unescape('_1', { map: {} })).toBe('1')
  })

  it('should decode default mapping tokens when map is provided explicitly', () => {
    expect(unescape('_b', { map: ComplexMap })).toBe('[')
  })

  it('should prefer longer tokens when decoding overlapping map outputs', () => {
    const map = {
      a: '_',
      b: '__',
    }
    expect(unescape('__', { map })).toBe('b')
    expect(unescape('___', { map })).toBe('ba')
  })

  it('should decode the maximum unicode code point sequence', () => {
    const maxCodePointChar = String.fromCodePoint(0x10FFFF)
    expect(unescape('u_x10ffff_')).toBe(maxCodePointChar)
  })

  it('should ignore unicode sequences above the maximum code point', () => {
    expect(unescape('u_x110000_')).toBe('u_x110000_')
  })

  it('should ignore unicode sequences without trailing underscore', () => {
    expect(unescape('u_x1f60a')).toBe('u_x1f60a')
  })

  it('should ignore unicode sequences at or below ASCII range', () => {
    expect(unescape('u_x7f_')).toBe('u_x7f_')
  })

  it('should keep leading underscores when ignoreHead is true', () => {
    expect(unescape('_1', { ignoreHead: true })).toBe('_1')
  })

  it('should decode unicode sequences when map is provided', () => {
    const map = { a: '_a' }
    expect(unescape('u_x1f60a_', { map })).toBe('😊')
  })

  it('should ignore invalid unicode markers when map is provided', () => {
    expect(unescape('u_x1g_', { map: {} })).toBe('u_x1g_')
  })

  it('should leave unknown default tokens untouched when map is provided', () => {
    expect(unescape('__', { map: ComplexMap })).toBe('__')
  })

  it('should skip empty tokens when decoding', () => {
    const map = {
      a: '',
      b: '_b',
    }
    const escaped = escape('ba', { map })
    expect(escaped).toBe('_b')
    expect(unescape(escaped, { map })).toBe('b')
  })

  it('should continue past empty tokens when no match exists', () => {
    const map = {
      a: '',
      b: '_b',
    }
    expect(unescape('_', { map })).toBe('')
  })

  it('should keep Tailwind-style class lists unchanged', () => {
    const source = 'w-full rounded-full bg-success p-1'
    const escaped = escape(source)
    expect(escaped).toBe(source)
    expect(unescape(escaped)).toBe(source)
  })
})
