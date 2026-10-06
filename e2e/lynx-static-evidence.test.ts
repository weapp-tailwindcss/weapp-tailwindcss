import { describe, expect, it } from 'vitest'
import { declarationMatches } from './lynx/static-evidence'

describe('Lynx static declaration evidence', () => {
  it.each([
    ['0.5', '50%', true],
    ['1', '100%', true],
    ['50', '50%', false],
    ['0.25', '50%', false],
    ['var(--opacity)', '50%', false],
    ['50% 0', '50%', false],
  ])('opacity %s 与 %s 的语义比较为 %s', (actual, expected, matches) => {
    expect(declarationMatches({ property: 'opacity', value: actual }, { property: 'opacity', value: expected }, true)).toBe(matches)
  })

  it('不把其它属性的数字与百分比当作等价值', () => {
    expect(declarationMatches({ property: 'width', value: '0.5' }, { property: 'width', value: '50%' }, true)).toBe(false)
  })

  it('requires an expected value to match instead of accepting the property name alone', () => {
    expect(declarationMatches(
      { property: 'width', value: '100px' },
      { property: 'width', value: '200px' },
      true,
    )).toBe(false)
  })

  it('normalizes insignificant whitespace and enforces important when requested', () => {
    expect(declarationMatches(
      { property: 'min-width', value: 'calc(100%  -  2rem)', important: true },
      { property: 'min-width', value: 'calc(100% - 2rem)', important: true },
      true,
    )).toBe(true)
    expect(declarationMatches(
      { property: 'display', value: 'flex' },
      { property: 'display', value: 'flex', important: true },
      true,
    )).toBe(false)
  })

  it('allows a property-only expectation for values that vary by Tailwind internals', () => {
    expect(declarationMatches(
      { property: 'box-shadow', value: '0 10px 15px rgb(0 0 0 / 0.1)' },
      { property: 'box-shadow' },
      true,
    )).toBe(true)
  })
})
