import { describe, expect, it } from 'vitest'
import { assertClassTokensInOutput } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/class/evidence'

const utility = 'text-xs'
const alias = 'wtu-textxs-b'
const binding = ':host,page,.tw-root,wx-root-portal-content{--text-xs:24rpx;--text-xs--line-height:calc(1 / 0.75)}'
const reference = 'font-size:var(--text-xs);line-height:var(--tw-leading,var(--text-xs--line-height))'

function verify(actual: string, bindings = binding, expected = reference) {
  return assertClassTokensInOutput({
    wxml: `<text class="${alias} data-v-00a60067"/>`,
    js: '',
    globalStyle: `${bindings}.${utility}{${expected}}.${alias}.${alias}.data-v-00a60067{${actual}}`,
  }, [utility], [utility], ['wxml'], 'nested-fallback-proof')
}

function withFallback(fallback: string) {
  return `font-size:24rpx;line-height:var(--tw-leading,var(--text-xs--line-height,${fallback}))`
}

describe('watch evidence for redundant nested variable fallback', () => {
  it.each(['', 'view,text{--tw-leading: }', '.other{--tw-leading:2}', '@media(min-width:1px){.other{--tw-leading:2}}'])('retains the unknown or empty outer variable: %s', (outerBinding) => {
    expect(verify(withFallback('calc(1 / 0.75)'), binding + outerBinding)[0]?.actualClass).toBe(alias)
  })

  it.each(['0', '-2', '12px', '5%', 'calc(1 / 0.75)', 'calc(2 * (3 - 1))', 'calc(-1 + 2)', 'calc(1e2 / 4)', 'calc(calc(1 + 1) / 2)', 'calc(0)'])('removes only a proven unused static fallback: %s', (fallback) => {
    expect(verify(withFallback(fallback))[0]?.actualClass).toBe(alias)
  })

  it('accepts the same redundant fallback on either side', () => {
    expect(verify(
      'font-size:24rpx;line-height:var(--tw-leading,var(--text-xs--line-height))',
      binding,
      'font-size:var(--text-xs);line-height:var(--tw-leading,var(--text-xs--line-height,calc(1 / 0.75)))',
    )[0]?.actualClass).toBe(alias)
  })

  it('keeps multiple unknown fallback levels in their original positions', () => {
    expect(verify(
      'line-height:var(--outer,var(--tw-leading,var(--text-xs--line-height,calc(1 / 0.75))))',
      binding,
      'line-height:var(--outer,var(--tw-leading,var(--text-xs--line-height)))',
    )[0]?.actualClass).toBe(alias)
  })

  it.each(['var(--missing)', 'var(--text-xs)', 'calc(var(--text-xs) / 2)', 'calc(1 / 0)', 'calc(1 / (1 - 1))', 'calc(1e309)', 'calc(1e308 * 1e308)', 'calc(1+ 2)', 'calc(1 +2)', 'calc(1/**/+/**/2)', 'calc(1 "*" 2)', 'calc(1 "/" 2)', 'calc(1px + 2px)', 'calc(1 * 2px)', 'calc(1px * 2px)', 'calc(1 / 2px)', 'calc(auto * 2)', 'url(./a)', 'env(safe-area-inset-top)', 'attr(data-size)', 'min(1,2)', 'initial', '"1"', '1e309', '1 2', '1 !invalid', 'var(bad)'])('rejects a dependent, invalid or unproven fallback: %s', (fallback) => {
    expect(() => verify(withFallback(fallback))).toThrow(utility)
  })

  it.each([String.raw`calc(v\61r(--text-xs))`, String.raw`calc(v\61 r(--text-xs))`])('does not hide dependencies in an escaped var function: %s', (fallback) => {
    expect(() => verify(withFallback(fallback))).toThrow(utility)
  })

  it('rejects an escaped local setter with the same inner variable identity', () => {
    expect(() => verify(withFallback('calc(1 / 0.75)'), `${binding}${String.raw`.local{--\74 ext-xs--line-height:2}`}`)).toThrow(utility)
  })

  it.each([
    '',
    'page{--text-xs--line-height:calc(1 / 0.75)}.local{--text-xs--line-height:2}',
    'page{--text-xs--line-height:calc(1 / 0.75)}.local{--text-xs--line-height:calc(1 / 0.75)}',
    '@media(min-width:1px){page{--text-xs--line-height:calc(1 / 0.75)}}',
    '@layer theme{page{--text-xs--line-height:calc(1 / 0.75)}}',
    'page{--text-xs--line-height:calc(1 / 0.75)}html{--text-xs--line-height:2}',
    'page{--text-xs--line-height:var(--missing)}',
    'page{--text-xs--line-height:var(--text-xs--line-height)}',
    'page{--text-xs--line-height:var(--known,var(--text-xs--line-height));--known:2}',
    'page{--text-xs--line-height: }',
    'page{--text-xs--line-height:initial}',
    '@property --text-xs--line-height{syntax:"<number>";inherits:false;initial-value:2}page{--text-xs--line-height:2}',
  ])('requires a complete uncovered inner root binding: %s', (bindings) => {
    expect(() => verify(withFallback('calc(1 / 0.75)'), `:root{--text-xs:24rpx}${bindings}`)).toThrow(utility)
  })

  it.each([
    'line-height:var(--other,var(--text-xs--line-height,calc(1 / 0.75)))',
    'line-height:var(--text-xs--line-height,calc(1 / 0.75))',
    'line-height:calc(1 / 0.75)',
    'line-height:var(--tw-leading,calc(1 / 0.75))',
    'line-height:var(--tw-leading)',
  ])('does not choose or inline the unknown outer fallback: %s', (actual) => {
    expect(() => verify(`font-size:24rpx;${actual}`)).toThrow(utility)
  })

  it('does not normalize nested fallback under an invalid outer var', () => {
    expect(() => verify(
      'line-height:var(--outer,var(--text-xs--line-height,calc(1 / 0.75)),!invalid)',
      binding,
      'line-height:var(--outer,var(--text-xs--line-height),!invalid)',
    )).toThrow(utility)
  })

  it('does not extend numeric calc fallback removal to custom-property definitions', () => {
    expect(() => verify(
      '--local:var(--tw-leading,var(--text-xs--line-height,calc(1 / 0.75)));line-height:var(--local)',
      binding,
      '--local:var(--tw-leading,var(--text-xs--line-height));line-height:var(--local)',
    )).toThrow(utility)
  })

  it('keeps parse-time and computed-time invalid declarations distinct', () => {
    expect(() => verify(
      'line-height:2;line-height:calc(1 / 0.75)',
      binding,
      'line-height:2;line-height:var(--text-xs--line-height,calc(1 / 0.75))',
    )).toThrow(utility)
  })

  it.each([
    'line-height:var(--tw-leading,var(--text-xs--line-height,calc(1 / 0.75)));font-size:24rpx',
    `${withFallback('calc(1 / 0.75)')}!important`,
    'font-size:24rpx',
    `${withFallback('calc(1 / 0.75)')};color:red`,
  ])('preserves complete declaration order and importance: %s', (actual) => {
    expect(() => verify(actual)).toThrow(utility)
  })
})
