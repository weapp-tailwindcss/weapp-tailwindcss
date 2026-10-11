import { applyConfiguredCssCalc } from '@/plugins/applyConfiguredCssCalc'

const UTILITY_CSS = `.gap-2 { gap: calc(var(--spacing) * 2); }
.p-2 { padding: calc(var(--spacing) * 2); }
.mt-2 { margin-top: calc(var(--spacing) * 2); }
.other { width: calc(var(--other) * 2); }`

describe('applyConfiguredCssCalc', () => {
  it('returns original css when cssCalc is disabled', async () => {
    const css = ':root { --spacing: .25rem; }\n.gap-2 { gap: calc(var(--spacing) * 2); }'
    await expect(applyConfiguredCssCalc(css)).resolves.toBe(css)
    await expect(applyConfiguredCssCalc(css, { cssCalc: false })).resolves.toBe(css)
  })

  it('precomputes matching variables from the current AST', async () => {
    const css = await applyConfiguredCssCalc(`:root, :host {
  --spacing: .25rem;
  --other: 2px;
}
${UTILITY_CSS}`, { cssCalc: ['--spacing'] })

    expect(css).toContain('gap: 0.5rem')
    expect(css).toContain('padding: 0.5rem')
    expect(css).toContain('margin-top: 0.5rem')
    expect(css).toContain('--spacing: .25rem')
    expect(css).toContain('width: calc(var(--other)*2)')
    expect(css).not.toMatch(/gap:\s*calc\(var\(--spacing\)/)
  })

  it.each([
    ['array', ['--scale'] as const],
    ['regexp', [/^--scale$/] as const],
    ['object', { includeCustomProperties: ['--scale'] } as const],
    ['boolean', true as const],
  ])('resolves mapped values with %s options at both entry points', async (_, cssCalc) => {
    for (const nested of [false, true]) {
      const css = await applyConfiguredCssCalc(
        '.x { gap: calc(var(--scale) * 2); padding: calc(var(--other) * 2) }',
        {
          ...(nested ? { cssOptions: { cssCalc } } : { cssCalc }),
          customPropertyValues: new Map([['--scale', '3rpx']]),
        },
      )
      expect(css).toContain('gap: 6rpx')
      expect(css).toMatch(/padding: calc\(var\(--other\)\s*\*\s*2\)/)
    }
  })

  it('preserves unknown fallbacks and cycles while resolving fixed chains', async () => {
    const fallback = await applyConfiguredCssCalc(
      '.x { gap: calc(var(--spacing, .25rem) * 2); }',
      { cssCalc: ['--spacing'] },
    )
    expect(fallback).toBe('.x { gap: calc(var(--spacing, .25rem)*2); }')

    const fixed = await applyConfiguredCssCalc(
      ':root { --spacing: .5rem; } .x { gap: calc(var(--spacing, .25rem) * 2); }',
      { cssCalc: ['--spacing'] },
    )
    expect(fixed).toContain('gap: 1rem')
    expect(fixed).not.toContain('calc(')

    const chained = await applyConfiguredCssCalc(
      '.x { width: calc(var(--space-lg) * 2); }',
      {
        cssCalc: ['--space-lg', '--space-md'],
        customPropertyValues: new Map([
          ['--space-lg', 'var(--space-md)'],
          ['--space-md', '4px'],
        ]),
      },
    )
    expect(chained).toContain('width: 8px')

    const cyclic = await applyConfiguredCssCalc(
      '.x { width: calc(var(--space-lg) * 2); }',
      {
        cssCalc: ['--space-lg', '--space-md'],
        customPropertyValues: new Map([
          ['--space-lg', 'var(--space-md)'],
          ['--space-md', 'var(--space-lg)'],
        ]),
      },
    )
    expect(cyclic).toMatch(/width: calc\(var\(--space-lg\)\s*\*\s*2\)/)
  })

  it('collects context css and lets explicit values win', async () => {
    const css = await applyConfiguredCssCalc(
      '.gap-2 { gap: calc(var(--spacing) * 2); }',
      {
        cssCalc: ['--spacing'],
        contextCss: ':root { --spacing: .25rem; }',
        customPropertyValues: new Map([['--spacing', '.5rem']]),
      },
    )
    expect(css).toContain('gap: 1rem')
  })

  it('does not throw on malformed css', async () => {
    await expect(applyConfiguredCssCalc('.broken { gap: calc(var(--spacing) * 2)', {
      cssCalc: ['--spacing'],
      customPropertyValues: new Map([['--spacing', '.25rem']]),
    })).resolves.toContain('calc(')
  })
})
