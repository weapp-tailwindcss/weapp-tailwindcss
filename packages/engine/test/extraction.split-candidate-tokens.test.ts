import { describe, expect, it } from 'vitest'
import {
  isValidCandidateToken,
  splitCandidateTokens,
} from '@/extraction/split-candidate-tokens'
import { splitCandidateTokens as splitCandidateTokensFromIndex } from '@/index'

describe('split candidate tokens', () => {
  it('splits plain source snippets without emitting empty tokens', () => {
    expect(splitCandidateTokens('  foo   bar  ')).toEqual(['foo', 'bar'])
    expect(splitCandidateTokens('"   "')).toEqual([])
  })

  it('splits quoted html-like attributes while preserving candidate values', () => {
    const snippet = 'class="foo bar" data-test="baz"'

    expect(splitCandidateTokens(snippet)).toEqual(['class=', 'foo', 'bar', 'data-test=', 'baz'])
  })

  it('preserves single and double quoted arbitrary values', () => {
    expect(splitCandidateTokens('before:content-["11111"] before:content-[\'222\']')).toEqual([
      'before:content-["11111"]',
      'before:content-[\'222\']',
    ])
    expect(splitCandidateTokens('<view class="before:content-[\\"11111\\"] text-red-500">')).toEqual([
      '<view',
      'class=',
      'before:content-[\\"11111\\"]',
      'text-red-500',
      '>',
    ])
    expect(splitCandidateTokens('before:content-["]"] before:content-[\']\']')).toEqual([
      'before:content-["]"]',
      'before:content-[\']\']',
    ])
    expect(splitCandidateTokens('before:content-["a\\"b"] text-red-500')).toEqual([
      'before:content-["a\\"b"]',
      'text-red-500',
    ])
  })

  it('does not swallow later tokens when arbitrary values are malformed', () => {
    expect(splitCandidateTokens('before:content-["11111" text-red-500 class="foo bar"')).toEqual([
      'before:content-[',
      '11111',
      'text-red-500',
      'class=',
      'foo',
      'bar',
    ])
    expect(splitCandidateTokens('before:content-["] text-red-500 class="foo bar"')).toEqual([
      'before:content-["]',
      'text-red-500',
      'class=',
      'foo',
      'bar',
    ])
  })

  it('normalizes escaped whitespace from minified output', () => {
    expect(splitCandidateTokens('foo\\nbar\\tbaz\\rqux')).toEqual(['foo', 'bar', 'baz', 'qux'])
  })

  it('exports the splitter from package entry', () => {
    expect(splitCandidateTokensFromIndex('foo before:content-["bar"]')).toEqual([
      'foo',
      'before:content-["bar"]',
    ])
    expect(splitCandidateTokensFromIndex('foo before:content-["bar"]')).toEqual([
      'foo',
      'before:content-["bar"]',
    ])
  })

  it('validates non-empty candidate-like tokens', () => {
    expect(isValidCandidateToken('text-red-500')).toBe(true)
    expect(isValidCandidateToken('"')).toBe(false)
  })

  it('keeps working after the split cache reaches its limit', () => {
    for (let index = 0; index < 8200; index++) {
      splitCandidateTokens(`token-${index}`)
    }

    expect(splitCandidateTokens('after-cache-clear text-red-500')).toEqual([
      'after-cache-clear',
      'text-red-500',
    ])
  })
})
