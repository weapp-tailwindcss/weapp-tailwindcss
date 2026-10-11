import { describe, expect, it } from 'vitest'
import { normalizeTailwindcssV4InfinityRadiusCss } from '@/index'

describe('normalizeTailwindcssV4InfinityRadiusCss public export', () => {
  it.each([
    'border-radius', 'border-top-left-radius', 'border-top-right-radius',
    'border-bottom-left-radius', 'border-bottom-right-radius',
    'border-start-start-radius', 'border-start-end-radius',
    'border-end-start-radius', 'border-end-end-radius',
    'BORDER-RADIUS', '--radius', '--radius-full', '--radius-pill',
  ])('normalizes %s and remains idempotent', (property) => {
    for (const value of ['calc(infinity * 1px)', 'calc(infinity * 2rpx)', 'calc(infinity * .5px)', 'calc(infinity * 1.25rpx)', 'CALC( INFINITY\n*\t2.PX )']) {
      const css = `@layer utilities{.rounded{${property}: ${value} !important}}`
      const expected = `@layer utilities{.rounded{${property}: 9999px !important}}`
      expect(normalizeTailwindcssV4InfinityRadiusCss(css)).toBe(expected)
      expect(normalizeTailwindcssV4InfinityRadiusCss(expected)).toBe(expected)
    }
  })

  it.each([
    '9999px', '10rpx', '50%', 'calc(2rpx * 3)',
    'calc(infinity * 0px)', 'calc(infinity * 0.0rpx)', 'calc(infinity * -1px)',
    'calc(infinity * 1rem)', 'calc(infinity * 1px + 2px)',
    'calc(infinity * 1px) 1px', 'calc(infinity * 1px) / 2px',
    'var(--radius, calc(infinity * 1px))', '"calc(infinity * 1px)"',
  ])('preserves out-of-scope value %s', (value) => {
    const css = `.x{border-radius:${value};--radius-full:${value}}`
    expect(normalizeTailwindcssV4InfinityRadiusCss(css)).toBe(css)
  })

  it('preserves comments, strings, unrelated declarations and variable case', () => {
    const css = [
      '/* border-radius:calc(infinity * 1px) */',
      '.x{content:"calc(infinity * 1px)";width:calc(infinity * 1px);',
      '--Radius-full:calc(infinity * 1px);--other:calc(infinity * 1px);',
      'border-fake-radius:calc(infinity * 1px);border-radius:calc(infinity * 1px)}',
    ].join('\n')
    expect(normalizeTailwindcssV4InfinityRadiusCss(css)).toBe(css.replace('border-radius:calc(infinity * 1px)}', 'border-radius:9999px}'))
  })
})
