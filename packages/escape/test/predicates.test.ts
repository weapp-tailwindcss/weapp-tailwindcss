import { describe, expect, it } from 'vitest'

import { isAllowedClassName, isAsciiNumber } from '../src/predicates'

describe('predicates', () => {
  it('isAsciiNumber should treat boundaries inclusively', () => {
    expect(isAsciiNumber(47)).toBe(false)
    expect(isAsciiNumber(48)).toBe(true)
    expect(isAsciiNumber(57)).toBe(true)
    expect(isAsciiNumber(58)).toBe(false)
  })

  it('isAllowedClassName should accept underscores and dashes only', () => {
    expect(isAllowedClassName('_foo-1')).toBe(true)
    expect(isAllowedClassName('foo 1')).toBe(false)
    expect(isAllowedClassName('foo.1')).toBe(false)
  })
})
