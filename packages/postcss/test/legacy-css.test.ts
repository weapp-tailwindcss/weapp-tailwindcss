import {
  collectDedupedPostTransformCompatCss,
  collectGeneratedSelectors,
  inheritLegacyUnitConvertedDeclarations,
  normalizeCompatSelectors,
  removeGeneratedSelectorCompatCss,
  removeTailwindApplyRules,
} from '@/index'

describe('legacy css compatibility helpers', () => {
  it('normalizes escaped selectors and ignores theme-only custom property rules', () => {
    expect(normalizeCompatSelectors('.w-\\[100px\\]:not(#\\#)')).toEqual([
      '.w-\\[100px\\]',
      '.w-_b100px_B',
    ])
    expect(normalizeCompatSelectors('   ')).toEqual([])

    const selectors = collectGeneratedSelectors([
      ':host,page{--color-red-500:red}',
      '.w-_b100px_B{width:100px}',
      '::before{--tw-content:""}',
    ].join('\n'))

    expect(selectors.has('.w-_b100px_B')).toBe(true)
    expect(selectors.has(':host')).toBe(false)
    expect(selectors.has('::before')).toBe(true)
    expect(collectGeneratedSelectors('.broken{').size).toBe(0)
  })

  it('removes compat selectors already generated while preserving custom properties', () => {
    const css = removeGeneratedSelectorCompatCss([
      '.w-\\[100px\\]{width:100px}',
      '.keep{color:red}',
      ':root{--token:1}',
      '::before{--tw-content:""}',
    ].join('\n'), '.w-_b100px_B{width:100px}')

    expect(css).not.toContain('.w-\\[100px\\]')
    expect(css).toContain('.keep')
    expect(css).toContain('--token')
    expect(css).not.toContain('--tw-content')
  })

  it('dedupes post-transform compat rules with legacy pseudo-element selectors', () => {
    const css = collectDedupedPostTransformCompatCss(
      '.before_ccontent-_b_aindependent_subpackage_mpx-tailwindcss-v4_a_B:before{--tw-content:"independent subpackage mpx-tailwindcss-v4";content:var(--tw-content)}',
      '.before_ccontent-_b_aindependent_subpackage_mpx-tailwindcss-v4_a_B::before{--tw-content:\'independent subpackage mpx-tailwindcss-v4\';content:var(--tw-content)}',
    )

    expect(css).toBe('')
  })

  it('inherits rpx declarations from legacy css onto matching px/rem rules', () => {
    const css = inheritLegacyUnitConvertedDeclarations(
      '.w-_b100px_B{width:100px}.keep{color:red}',
      '.w-\\[100px\\]{width:200rpx}',
    )
    expect(css).toContain('width:200rpx')
    expect(css).toContain('.keep{color:red}')
    expect(inheritLegacyUnitConvertedDeclarations('.keep{color:red}', '.broken{')).toBe('.keep{color:red}')
  })

  it('removes @apply rules and empty wrapper at-rules', () => {
    expect(removeTailwindApplyRules('@media screen { .card { @apply flex; } } .keep{color:red}')).toBe('.keep{color:red}')
    expect(removeTailwindApplyRules('@apply flex; .keep{color:red}')).toBe('.keep{color:red}')
    expect(removeTailwindApplyRules('.keep{color:red}')).toBe('.keep{color:red}')
    expect(removeTailwindApplyRules('.broken{')).toBe('.broken{')
  })
})
