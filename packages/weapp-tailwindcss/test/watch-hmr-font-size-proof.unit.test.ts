import { describe, expect, it } from 'vitest'
import { assertClassTokensInOutput } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/class/evidence'

const utility = 'text-xs'
const alias = 'wtu-fontsize-0'
const theme = ':host,page,.tw-root,wx-root-portal-content{--text-xs:24rpx;--text-xs--line-height:calc(1 / 0.75)}'

function verify(reference: string, actual: string, bindings = theme) {
  return assertClassTokensInOutput({
    wxml: `<text class="${alias} data-v-a1"/>`,
    js: '',
    globalStyle: `${bindings}.${utility}{${reference}}.${alias}.${alias}.data-v-a1{${actual}}`,
  }, [utility], [utility], ['wxml'], 'font-size-proof')
}

describe('watch class evidence with font-size validity proofs', () => {
  it('accepts the proven font-size from the text-xs watch failure', () => {
    expect(verify('font-size:var(--text-xs)', 'font-size:24rpx')[0]?.actualClass).toBe(alias)
  })

  it.each(['24rpx', '12px', '0.75rem', '.5em', '1ex', '2ch', '3vw', '4vh', '2vmin', '2vmax', '1cm', '1mm', '1q', '1in', '1pt', '1pc', '125%', '0%', '0', '-0', '+0', '0px', '-0rpx', '+24rpx', '2.4e1rpx', '24RPX'])('proves a nonnegative literal: %s', (value) => {
    expect(verify('font-size:var(--text-xs)', `font-size:${value}`, `:root{--text-xs:${value}}`)[0]?.actualClass).toBe(alias)
  })

  it('supports a complete chain of uncovered root bindings', () => {
    expect(verify('font-size:var(--text-xs)', 'font-size:24rpx', ':root{--text-xs:var(--base);--base:24rpx}page{--base:24rpx}')[0]?.actualClass).toBe(alias)
  })

  it('allows comments around one complete value token', () => {
    expect(verify('font-size:var(--text-xs)', 'font-size:24rpx', ':root{--text-xs:/**/24rpx/**/}')[0]?.actualClass).toBe(alias)
  })

  it.each(['-24rpx', '-1em', '-0.1%', '-2.4e1px', '1', '-1', '1e309px', '1e309%', '24quux', '24deg', 'auto', 'inherit', 'initial', 'unset', 'revert', 'revert-layer', 'smaller', 'larger', 'medium', '24rpx 12rpx', '24/**/rpx', '"24rpx"', 'calc(24rpx)', 'calc(24rpx * 2)', 'calc(-24rpx)', 'min(24rpx,12rpx)', 'env(size)', 'attr(data-size)'])('rejects an unproven or invalid font-size: %s', (value) => {
    expect(() => verify('font-size:12px;font-size:var(--text-xs)', `font-size:12px;font-size:${value}`, `:root{--text-xs:${value}}`)).toThrow(utility)
  })

  it.each(['var(--text-xs)rpx', 'var(--text-xs) rpx', 'var(--text-xs)/**/rpx'])('does not join a substituted number to a unit: %s', (value) => {
    expect(() => verify(`font-size:${value}`, 'font-size:24rpx', ':root{--text-xs:24}')).toThrow(utility)
  })

  it.each(['var(--text-xs,24rpx !invalid)', 'var(--text-xs,var(bad))'])('retains invalid fallback syntax: %s', (value) => {
    expect(() => verify(`font-size:${value}`, 'font-size:24rpx')).toThrow(utility)
  })

  it.each([
    '',
    ':root{--text-xs:24rpx}.local{--text-xs:24rpx}',
    ':root{--text-xs:24rpx}.local{--text-xs:12rpx}',
    ':root{--text-xs:24rpx}@media (width>1px){page{--text-xs:24rpx}}',
    ':root{--text-xs:24rpx}@layer theme{page{--text-xs:24rpx}}',
    ':root{--text-xs:24rpx}page{--text-xs:12rpx}',
    ':root{--text-xs:var(--text-xs)}',
    ':root{--text-xs:var(--missing)}',
    ':root{--text-xs:var(--base,var(--text-xs));--base:24rpx}',
    ':root{--text-xs:var(--base);--base:24rpx}.local{--base:12rpx}',
    '@property --text-xs{syntax:"<length>";inherits:false;initial-value:24rpx}:root{--text-xs:24rpx}',
  ])('requires an uncovered complete root binding: %s', (bindings) => {
    expect(() => verify('font-size:var(--text-xs)', 'font-size:24rpx', bindings)).toThrow(utility)
  })

  it('keeps unknown outer variable fallback semantics', () => {
    expect(() => verify('font-size:var(--runtime,var(--text-xs))', 'font-size:var(--runtime,24rpx)')).toThrow(utility)
    expect(() => verify('font-size:var(--missing,24rpx)', 'font-size:24rpx')).toThrow(utility)
  })

  it('does not extend the proof to line-height or other properties', () => {
    expect(() => verify('line-height:var(--text-xs)', 'line-height:24rpx')).toThrow(utility)
    expect(() => verify('width:var(--text-xs)', 'width:24rpx')).toThrow(utility)
  })

  it('still rejects the complete failed snapshot with a lost dynamic line-height', () => {
    expect(() => verify(
      'font-size:var(--text-xs);line-height:var(--tw-leading,var(--text-xs--line-height))',
      'font-size:24rpx;line-height:calc(1 / 0.75)',
      `${theme}view,text,::after,::before{--tw-leading: }`,
    )).toThrow(utility)
  })

  it('accepts font-size only when the complete remaining declarations match', () => {
    const lineHeight = 'line-height:var(--tw-leading,var(--text-xs--line-height))'
    expect(verify(`font-size:var(--text-xs);${lineHeight}`, `font-size:24rpx;${lineHeight}`)[0]?.actualClass).toBe(alias)
  })

  it.each([
    ['font-size:var(--text-xs)', 'font-size:29rpx'],
    ['font-size:var(--text-xs)!important', 'font-size:24rpx'],
    ['font-size:var(--text-xs);line-height:1.5', 'font-size:24rpx'],
    ['font-size:var(--text-xs)', 'font-size:24rpx;line-height:1.5'],
    ['font-size:var(--text-xs);line-height:1.5', 'line-height:1.5;font-size:24rpx'],
  ])('preserves values, importance and complete declaration order: %s', (reference, actual) => {
    expect(() => verify(reference, actual)).toThrow(utility)
  })
})
