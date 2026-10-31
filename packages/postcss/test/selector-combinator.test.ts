import type { IStyleHandlerOptions } from '../src/types'
import { describe, expect, it } from 'vitest'
import { composeIsPseudoAst, getCombinatorSelectorAst } from '../src/selectorParser/utils'

describe('child combinator replacement inputs', () => {
  it('rejects an empty direct replacement instead of emitting an undefined tag', () => {
    expect(() => composeIsPseudoAst([])).toThrow(new RangeError('Selector replacement must contain at least one selector'))
  })

  it.each([
    { input: 'view', expected: 'view+view' },
    { input: ['text'], expected: 'text+text' },
    { input: ['view', 'text'], expected: ':is(view,text)+:is(view,text)' },
  ])('preserves $expected', ({ input, expected }) => {
    expect(composeIsPseudoAst(input).map(node => node.toString()).join('')).toBe(expected)
  })

  it('keeps the configuration default for an empty list and returns independent cached clones', () => {
    const options: IStyleHandlerOptions = { cssChildCombinatorReplaceValue: [] }
    const first = getCombinatorSelectorAst(options)
    expect(first.map(node => node.toString()).join('')).toBe('view+view')
    const tag = first[0]
    expect(tag?.type).toBe('tag')
    if (tag) {
      tag.value = 'changed'
    }
    const next = getCombinatorSelectorAst(options)
    expect(next.map(node => node.toString()).join('')).toBe('view+view')
    for (const [index, node] of next.entries()) {
      expect(node).not.toBe(first[index])
    }
  })
})
