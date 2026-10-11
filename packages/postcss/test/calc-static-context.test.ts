import type { IStyleHandlerOptions } from '@/types'
import { createStyleHandler } from '@/handler'
import { applyConfiguredCssCalc } from '@/plugins/applyConfiguredCssCalc'
import { analyzeCssCalcContext } from '@/utils/css-calc-context'

const options = { cssCalc: ['--spacing', '--base'] }
const width = '.w-32 { width: calc(var(--spacing, 5rpx) * 32) }'

const entries = [
  ['eager', async (css: string, extra: Partial<IStyleHandlerOptions> = {}) => (await createStyleHandler({ ...options, ...extra })(css)).css],
  ['deferred', (css: string, extra: Partial<IStyleHandlerOptions> = {}) => applyConfiguredCssCalc(css, { ...options, ...extra })],
] as const

describe.each(entries)('%s calc static context', (_, transform) => {
  it.each([
    '.compact { --spacing: 2rpx }',
    '@media (min-width: 500px) { :root { --spacing: 2rpx } }',
    '@supports (display: grid) { :root { --spacing: 2rpx } }',
    '@layer overrides { :root { --spacing: 2rpx } }',
    ':host { --spacing: 2rpx }',
  ])('preserves runtime values when scope can override: %s', async (override) => {
    const css = await transform(`:root { --spacing: 1rpx } ${override} ${width}`, {
      customPropertyValues: new Map([['--spacing', '1rpx']]),
    })
    expect(css).toMatch(/width:\s*calc\(var\(--spacing,\s*5rpx\)\s*\*\s*32\)/)
    expect(css).not.toMatch(/width:\s*(?:32|64|160)rpx/)
  })

  it.each(['1', '2', '8', '0.5'])('staticizes an unconditional %srpx theme', async (value) => {
    const css = await transform(`@layer theme { :root, :host { --spacing: ${value}rpx } } ${width}`)
    expect(css).toContain(`width: ${Number(value) * 32}rpx`)
  })

  it('keeps unresolved fallbacks even when explicitly selected', async () => {
    const css = await transform(width)
    expect(css).toContain('var(--spacing')
    expect(css).not.toContain('160rpx')
  })

  it('preserves aliases of dynamic variables', async () => {
    const css = await transform(`:root { --spacing: var(--base, 5rpx); --base: 1rpx } .compact { --base: 2rpx } ${width}`)
    expect(css).toContain('var(--spacing')
    expect(css).not.toMatch(/width:\s*(?:32|64|160)rpx/)
  })

  it('preserves cyclic and unresolved alias values', async () => {
    for (const source of [
      ':root { --spacing: var(--base); --base: var(--spacing) }',
      ':root { --spacing: var(--missing, 5rpx) }',
    ]) {
      const css = await transform(`${source} ${width}`)
      expect(css).toContain('var(--spacing')
      expect(css).not.toContain('width: 160rpx')
    }
  })

  it('uses the compiled effective theme instead of source @theme defaults', async () => {
    const css = await transform(`@theme { --spacing: 8rpx } :root, :host { --spacing: 1rpx } ${width}`)
    expect(css).toContain('width: 32rpx')
  })

  it('resolves fixed alias dependencies without selecting unrelated use sites', async () => {
    const css = await transform(':root { --spacing: calc(var(--base) * 2); --base: 1rpx } .x { width: calc(var(--spacing) * 32); padding: calc(var(--base) * 4) }', {
      cssCalc: ['--spacing'],
    })
    expect(css).toContain('width: 64rpx')
    expect(css).toMatch(/padding: calc\(var\(--base\)\s*\*\s*4\)/)
  })

  it('keeps nonselected variables and disabled calc expressions', async () => {
    const source = ':root { --spacing: 1rpx; --other: 2rpx } .x { width: calc(var(--other, 5rpx) * 32) }'
    expect(await transform(source)).toContain('var(--other')
    expect(await transform(`:root { --spacing: 1rpx } ${width}`, { cssCalc: false })).toContain('var(--spacing')
  })
})


describe('safe calc context boundaries', () => {
  it('keeps variables introduced only in a local rule or property registration dynamic', () => {
    for (const source of [
      '.compact { --spacing: 1rpx }',
      '@property --spacing { syntax: "<length>"; inherits: false; initial-value: 1rpx }',
      '.outer { :root { --spacing: 1rpx } }',
    ]) {
      const context = analyzeCssCalcContext(source, new Map([['--spacing', '8rpx']]))
      expect(context.customPropertyValues.has('--spacing')).toBe(false)
    }
  })

  it('rejects malformed contexts and CSS-wide values', () => {
    expect(analyzeCssCalcContext(':root {', new Map([['--spacing', '1rpx']])).customPropertyValues.size).toBe(0)
    expect(analyzeCssCalcContext(':root { --spacing: inherit }').customPropertyValues.size).toBe(0)
  })

  it('bounds deeply nested dependencies without overflowing the stack', () => {
    const declarations = Array.from({ length: 300 }, (_, index) => `--v${index}: var(--v${index + 1});`).join('')
    expect(analyzeCssCalcContext(`:root { ${declarations} --v300: 1rpx }`).customPropertyValues.has('--v0')).toBe(false)
  })

  it('reads the unit-converted theme after assessing its original scope', async () => {
    const handler = createStyleHandler({ cssCalc: ['--spacing'], rem2rpx: true })
    const { css } = await handler(':root { --spacing: 0.25rem } .x { width: calc(var(--spacing) * 4) }')
    expect(css).toContain('width: 32rpx')
    expect(css).not.toContain('width: 1rem')
  })

  it('keeps a dynamic override from an external full context even for utility-only output', async () => {
    const css = await applyConfiguredCssCalc(width, {
      cssCalc: ['--spacing'],
      customPropertyContextCss: ':root { --spacing: 1rpx } .compact { --spacing: 2rpx }',
      customPropertyValues: new Map([['--spacing', '1rpx']]),
    })
    expect(css).toContain('var(--spacing')
    expect(css).not.toContain('width: 32rpx')
  })
})


describe('calc pipeline output semantics', () => {
  it('converts external values and full themes with the same unit pipeline', async () => {
    const handler = createStyleHandler({
      cssCalc: ['--spacing'], rem2rpx: true,
      customPropertyValues: new Map([['--spacing', '0.25rem']]),
    })
    expect((await handler('.x { width: calc(var(--spacing) * 4) }')).css).toContain('width: 32rpx')
  })

  it.each([
    ['px2rpx', { px2rpx: true }, '1px', '32rpx'],
    ['unitsToPx', { unitsToPx: { unitMap: { rem: 16 } } }, '1rem', '512px'],
    ['unitConversion', { unitConversion: { rules: [{ from: 'rpx', to: 'px', factor: 0.5 }] } }, '2rpx', '32px'],
  ] as const)('staticizes before %s for inline and external theme values', async (_, unitOptions, value, expected) => {
    for (const external of [false, true]) {
      const handler = createStyleHandler({
        cssCalc: ['--spacing'],
        ...unitOptions,
        ...(external ? { customPropertyValues: new Map([['--spacing', value]]) } : {}),
      } as Partial<IStyleHandlerOptions>)
      const source = `${external ? '' : `:root { --spacing: ${value} }`} .x { width: calc(var(--spacing) * 32) }`
      expect((await handler(source)).css).toContain(`width: ${expected}`)
    }
  })

  it.each([false, true])('keeps an explicit preserve option at eager=%s', async (eager) => {
    const cssCalc = { includeCustomProperties: ['--spacing'], preserve: true }
    const source = ':root { --spacing: 1rpx } .x { width: calc(var(--spacing) * 32) }'
    const css = eager
      ? (await createStyleHandler({ cssCalc })(source)).css
      : await applyConfiguredCssCalc(source, { cssCalc })
    expect(css).toContain('width: 32rpx')
    expect(css).toContain('width: calc(var(--spacing)')
  })

  it('keeps author fallbacks and plain var declarations even with selected variables', async () => {
    const handler = createStyleHandler({ cssCalc: ['--spacing'] })
    const { css } = await handler(':root { --spacing: 1rpx } .compact { --spacing: 2rpx } .x { width: 32rpx; width: calc(var(--spacing) * 32); padding: 1rpx; padding: var(--spacing) }')
    expect(css).toContain('width: 32rpx')
    expect(css).toContain('width: calc(var(--spacing)')
    expect(css).toContain('padding: var(--spacing)')
  })
})
