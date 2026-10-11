import { describe, expect, it } from 'vitest'
import { replaceWxml } from '../../../tools/weapp-tailwindcss-scripts/src/core/replace-wxml'
import { assertClassTokensInOutput } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/class/evidence'

const utility = '!mt-2'
const alias = 'wtu-margin-0'

function verify(reference: string, actual: string, bindings = ':root{--gutter:8rpx}') {
  return assertClassTokensInOutput({
    wxml: `<view class="${alias} data-v-a1"/>`,
    js: '',
    globalStyle: `${bindings}.${replaceWxml(utility)}{${reference}}.${alias}.${alias}.data-v-a1{${actual}}`,
  }, [utility], [replaceWxml(utility)], ['wxml'], 'declaration-proof')
}

describe('watch class evidence with declaration validity proofs', () => {
  it.each(['margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'margin-block-start', 'margin-block-end', 'margin-inline-start', 'margin-inline-end'])('accepts a proven length for %s', (property) => {
    expect(verify(`${property}:calc(var(--gutter) * 2)!important`, `${property}:calc(8rpx * 2)!important`)[0]?.actualClass).toBe(alias)
  })

  it.each(['8rpx', '-8px', '12.5%', '-12.5%', '0', '-0', 'auto', 'calc(8rpx * 2)', 'calc((8rpx + 4%) / (3 - 1))', 'calc(2 * (8rpx - -2px))', 'calc(8rpx/2)'])('proves the margin grammar for %s', (value) => {
    expect(verify('margin-top:var(--gutter)', `margin-top:${value}`, `:root{--gutter:${value}}`)[0]?.actualClass).toBe(alias)
  })

  it('allows an unused declaration fallback after proving the resulting margin value', () => {
    expect(verify('margin-top:var(--gutter,var(--missing))', 'margin-top:8rpx')[0]?.actualClass).toBe(alias)
  })

  it('retains token boundaries instead of joining a substituted number to a unit', () => {
    expect(() => verify('margin-top:var(--gutter)px', 'margin-top:8px', ':root{--gutter:8}')).toThrow(utility)
  })

  it.each(['8rpx 2px', '2', 'calc(0)', 'calc(0 + 1px)', 'calc(8rpx * 2px)', 'calc(8rpx / 0)', 'calc(8rpx / (1 - 1))', 'calc(8rpx / 2px)', 'calc(1px +2px)', 'calc(1px+ 2px)', 'calc(1px/**/+/**/2px)', 'calc(auto * 2)', 'calc(2deg * 2)', '8quux', 'calc(8rpx * 1e309)', 'calc(8rpx * (1e308 * 1e308))', 'max(8rpx,1px)'])('rejects an unproven margin value: %s', (value) => {
    expect(() => verify('margin-top:var(--gutter)', `margin-top:${value}`, `:root{--gutter:${value}}`)).toThrow(utility)
  })

  it.each(['color', 'padding-top', 'width', 'margin', 'margin-inline', '--margin'])('does not extend full inlining to %s', (property) => {
    expect(() => verify(`${property}:var(--gutter)`, `${property}:8rpx`)).toThrow(utility)
  })

  it('keeps parse-time invalid literals different from computed-time invalid variables', () => {
    expect(() => verify('color:red;color:var(--gutter)', 'color:red;color:8rpx')).toThrow(utility)
  })

  it('preserves important and expression structure after validating the value', () => {
    expect(() => verify('margin-top:calc(var(--gutter) * 2)!important', 'margin-top:calc(8rpx * 2)')).toThrow(utility)
    expect(() => verify('margin-top:calc(var(--gutter) * 2)', 'margin-top:16rpx')).toThrow(utility)
  })

  it('does not equate valid calc whitespace with comments in an invalid literal', () => {
    expect(() => verify('margin-top:calc(var(--gutter) + 2px)', 'margin-top:calc(8rpx/**/+/**/2px)')).toThrow(utility)
    expect(() => verify('margin-top:calc(8rpx/**/+/**/2px)', 'margin-top:calc(var(--gutter) + 2px)')).toThrow(utility)
  })

  it('does not treat a multi-token variable as a grouped arithmetic atom', () => {
    expect(() => verify('margin-top:calc(var(--gutter) * 2)', 'margin-top:calc(8rpx + 2px * 2)', ':root{--gutter:8rpx + 2px}')).toThrow(utility)
  })

  it.each(['var(--gutter,8px !invalid)', 'var(--gutter,var(bad))'])('does not discard invalid fallback syntax at ordinary declaration sites: %s', (value) => {
    expect(() => verify(`margin-top:1px;margin-top:${value}`, 'margin-top:1px;margin-top:8rpx')).toThrow(utility)
    expect(() => verify(`margin-top:calc(${value} * var(--runtime))`, 'margin-top:calc(8rpx * var(--runtime))')).toThrow(utility)
  })

  it.each([
    ':root{--gutter:calc(1px/**/+/**/2px)}html{--gutter:calc(1px + 2px)}',
    'html{--gutter:calc(1px + 2px)}:root{--gutter:calc(1px/**/+/**/2px)}',
  ])('does not collapse root definitions with different calc syntax: %s', (bindings) => {
    expect(() => verify('margin-top:var(--gutter)', 'margin-top:calc(1px + 2px)', bindings)).toThrow(utility)
  })

  it.each(['calc(8rpx "*" 2)', 'calc(8rpx "/" 2)', 'calc(8rpx "+" 2px)', 'calc(8rpx "-" 2px)'])('does not treat a string as an arithmetic operator: %s', (value) => {
    expect(() => verify('margin-top:var(--gutter)', `margin-top:${value}`, `:root{--gutter:${value}}`)).toThrow(utility)
  })

  it.each(['0.25rem', '3px', '-2', '5%'])('removes only the unused static fallback %s in a custom-property definition', (fallback) => {
    expect(verify('--local:calc(var(--gutter) * -1);translate:var(--x) var(--local)', `--local:calc(var(--gutter,${fallback}) * -1);translate:var(--x) var(--local)`)[0]?.actualClass).toBe(alias)
  })

  it.each(['var(--local)', 'var(--other)', 'calc(1px + 2px)', 'env(safe-area-inset-top)', 'attr(data-size)', 'url(./a)', 'random(1,2)', 'initial', '1e309', '8px !invalid', '8px 2px'])('keeps fallback dependencies or unproven values: %s', (fallback) => {
    expect(() => verify('--local:var(--gutter)', `--local:var(--gutter,${fallback})`)).toThrow(utility)
  })

  it.each([
    '',
    ':root{--gutter:8rpx}.local{--gutter:10rpx}',
    ':root{--gutter:8rpx}@media (width>1px){page{--gutter:10rpx}}',
    ':root{--gutter:8rpx}page{--gutter:10rpx}',
    ':root{--gutter:var(--gutter)}',
    ':root{--gutter:var(--missing)}',
    ':root{--gutter:env(safe-area-inset-top)}',
    '@property --gutter{syntax:"<length>";inherits:false;initial-value:8rpx}:root{--gutter:8rpx}',
  ])('does not drop fallback without a proven primary binding: %s', (bindings) => {
    expect(() => verify('--local:var(--gutter)', '--local:var(--gutter,0.25rem)', bindings)).toThrow(utility)
  })

  it('does not inline the custom-property body or remove another runtime variable fallback', () => {
    expect(() => verify('--local:var(--gutter)', '--local:8rpx')).toThrow(utility)
    expect(() => verify('--local:var(--gutter,var(--local))', '--local:var(--gutter)')).toThrow(utility)
    expect(() => verify('--local:var(--gutter);translate:var(--x,0)', '--local:var(--gutter,0.25rem);translate:var(--x,1)')).toThrow(utility)
  })
})
