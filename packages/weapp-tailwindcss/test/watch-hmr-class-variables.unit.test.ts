import { describe, expect, it } from 'vitest'
import { replaceWxml } from '../../../tools/weapp-tailwindcss-scripts/src/core/replace-wxml'
import { assertClassTokensInOutput } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/class/evidence'

const utility = 'space-y-2.5'
const escaped = replaceWxml(utility)
const alias = 'wtu-spacing-0'

function verify(bindings: string, reference = 'var(--gutter)', actual = '8rpx') {
  return assertClassTokensInOutput({
    wxml: `<view class="${alias} data-v-a1"><view/><view/></view>`,
    js: '',
    globalStyle: `${bindings}\n.${escaped}>view+view{--factor:1;margin-top:calc(${reference} * var(--factor))}\n.${alias}.data-v-a1.${alias}>view+view{--factor:1;margin-top:calc(${actual} * var(--factor))}`,
  }, [utility], [escaped], ['wxml'], 'variables')
}

describe('watch class evidence with global variables', () => {
  it.each([
    ':root{--gutter:8rpx}',
    'html{--gutter:8rpx}',
    ':host,page,.tw-root,wx-root-portal-content{--gutter:8rpx}',
    ':root{--gutter:8rpx}page{--gutter: 8rpx}',
    ':root{--unit:8rpx;--gutter:var(--unit)}',
    ':root{--unit:8rpx;--gutter:var(--unit,10rpx)}',
  ])('accepts a proven global binding: %s', (bindings) => {
    expect(verify(bindings)[0]?.actualClass).toBe(alias)
  })

  it('compares the actual spacing structure after inlining the recorded theme value', () => {
    const declarations = (value: string) => `--tw-space-y-reverse:0;
      margin-bottom:calc((${value} * 2.5) * var(--tw-space-y-reverse));
      margin-bottom:calc(calc(${value} * 2.5) * var(--tw-space-y-reverse));
      margin-top:calc((${value} * 2.5) * (1 - var(--tw-space-y-reverse)));
      margin-top:calc(calc(${value} * 2.5) * calc(1 - var(--tw-space-y-reverse)));`
    const selectors = (value: string) => ['view+view', 'view+text', 'text+view', 'text+text'].map(child => `${value}>${child}`).join(',')
    const result = assertClassTokensInOutput({
      wxml: `<view class="${alias} data-v-a1"><view/><text/></view>`,
      js: '',
      globalStyle: `:host,page,.tw-root,wx-root-portal-content{--spacing:8rpx}
        ${selectors(`.${escaped}`)}{${declarations('var(--spacing)')}}
        ${selectors(`.${alias}.data-v-a1.${alias}`)}{${declarations('8rpx')}}`,
    }, [utility], [escaped], ['wxml'], 'spacing')
    expect(result[0]?.actualClass).toBe(alias)
    expect(result[0]?.ruleSignatures).toHaveLength(4)
  })

  it('uses an existing valid binding before its declaration fallback', () => {
    expect(verify(':root{--gutter:8rpx}', 'var(--gutter, var(--missing, 20rpx))')[0]?.actualClass).toBe(alias)
    expect(() => verify(':root{--gutter:8rpx}', 'var(--gutter, 20rpx)', '20rpx')).toThrow(utility)
  })

  it('keeps local custom-property fallback cycles distinct from literal definitions', () => {
    expect(() => assertClassTokensInOutput({
      wxml: `<view class="${alias}"/>`,
      js: '',
      globalStyle: `:root{--known:8rpx}
        .${escaped}{--local:var(--known,var(--local));margin:var(--local)}
        .${alias}{--local:8rpx;margin:var(--local)}`,
    }, [utility], [escaped], ['wxml'], 'local-cycle')).toThrow(utility)
  })

  it.each([
    ['pure literal in an unproven property', 'padding-top:var(--gutter)', 'padding-top:8rpx'],
    ['discarded fallback in an unproven property', 'padding-top:var(--gutter,var(--missing))', 'padding-top:8rpx'],
    ['parse-time invalid literal', 'color:red;color:var(--gutter)', 'color:red;color:8rpx'],
    ['different remaining variable', 'margin-top:calc(var(--gutter) * var(--a))', 'margin-top:calc(8rpx * var(--b))'],
    ['different remaining fallback', 'margin-top:calc(var(--gutter) * var(--a,1))', 'margin-top:calc(8rpx * var(--a,2))'],
  ])('rejects %s without a proof of matching computed-value stages', (_, reference, actual) => {
    expect(() => assertClassTokensInOutput({
      wxml: `<view class="${alias}"/>`,
      js: '',
      globalStyle: `:root{--gutter:8rpx}.${escaped}{${reference}}.${alias}{${actual}}`,
    }, [utility], [escaped], ['wxml'], 'computed-stage')).toThrow(utility)
  })

  it.each([
    ['missing binding', '', 'var(--gutter)'],
    ['missing binding with fallback', '', 'var(--gutter,8rpx)'],
    ['conflicting root definitions', ':root{--gutter:8rpx}page{--gutter:10rpx}', 'var(--gutter)'],
    ['local override', ':root{--gutter:8rpx}.theme{--gutter:10rpx}', 'var(--gutter)'],
    ['same local value is unproven', ':root{--gutter:8rpx}.theme{--gutter:8rpx}', 'var(--gutter)'],
    ['conditional override', ':root{--gutter:8rpx}@media (width>500px){page{--gutter:10rpx}}', 'var(--gutter)'],
    ['conditional binding only', '@supports (display:grid){:root{--gutter:8rpx}}', 'var(--gutter)'],
    ['layered binding', '@layer theme{:root{--gutter:8rpx}}', 'var(--gutter)'],
    ['animated binding', ':root{--gutter:8rpx}@keyframes grow{to{--gutter:10rpx}}', 'var(--gutter)'],
    ['starting style binding', ':root{--gutter:8rpx}@starting-style{:root{--gutter:10rpx}}', 'var(--gutter)'],
    ['qualified root', 'page.theme{--gutter:8rpx}', 'var(--gutter)'],
    ['root descendant', ':root .theme{--gutter:8rpx}', 'var(--gutter)'],
    ['unknown root list branch', ':root,:unknown-pseudo{--gutter:8rpx}', 'var(--gutter)'],
    ['registered property', '@property --gutter{syntax:"<length>";inherits:false;initial-value:8rpx}:root{--gutter:8rpx}', 'var(--gutter)'],
    ['inherited keyword', ':root{--gutter:inherit}', 'var(--gutter,8rpx)'],
    ['initial keyword', ':root{--gutter:initial}', 'var(--gutter,8rpx)'],
    ['commented CSS-wide keyword', ':root{--gutter:/**/ INITIAL}', 'var(--gutter,8rpx)'],
    ['escaped CSS-wide keyword', String.raw`:root{--gutter:\69 nitial}`, 'var(--gutter,8rpx)'],
    ['escaped local override', String.raw`:root{--gutter:8rpx}.theme{--g\75 tter:10rpx}`, 'var(--gutter)'],
    ['escaped conflicting root', String.raw`:root{--gutter:8rpx;--g\75 tter:10rpx}`, 'var(--gutter)'],
    ['escaped registration', String.raw`@property --g\75 tter{syntax:"<length>";inherits:false;initial-value:8rpx}:root{--gutter:8rpx}`, 'var(--gutter)'],
    ['direct cycle', ':root{--gutter:var(--gutter,8rpx)}', 'var(--gutter,8rpx)'],
    ['indirect cycle', ':root{--gutter:var(--unit);--unit:var(--gutter)}', 'var(--gutter,8rpx)'],
    ['unused fallback cycle', ':root{--gutter:var(--unit,var(--gutter));--unit:8rpx}', 'var(--gutter)'],
    ['indirect fallback cycle', ':root{--gutter:var(--unit);--unit:var(--base,var(--gutter));--base:8rpx}', 'var(--gutter)'],
    ['unproven dependency', ':root{--gutter:var(--unit,8rpx)}', 'var(--gutter)'],
    ['unproven fallback dependency', ':root{--unit:8rpx;--gutter:var(--unit,var(--missing))}', 'var(--gutter)'],
    ['locally overridden dependency', ':root{--unit:8rpx;--gutter:var(--unit)}.theme{--unit:10rpx}', 'var(--gutter)'],
  ])('rejects %s', (_, bindings, reference) => {
    expect(() => verify(bindings, reference)).toThrow(utility)
  })

  it('does not merge adjacent tokens during substitution', () => {
    expect(() => verify(':root{--gutter:8}', 'var(--gutter)rpx')).toThrow(utility)
  })

  it('does not expand an invalid custom-property declaration value', () => {
    expect(() => verify(':root{--gutter:8rpx !invalid}', 'var(--gutter)', '8rpx !invalid')).toThrow(utility)
  })

  it.each(['url(./local.png)', 'attr(data-size)', 'env(safe-area-inset-top)', 'random(8rpx, 9rpx)', 'sibling-index()', '--custom-function()'])('keeps context-sensitive %s unresolved', (value) => {
    expect(() => verify(`:root{--gutter:${value}}`, 'var(--gutter)', value)).toThrow(utility)
  })

  it('does not expand variables in media conditions', () => {
    expect(() => assertClassTokensInOutput({
      wxml: `<view class="${alias}"/>`,
      js: '',
      globalStyle: `:root{--gutter:8rpx}@media (width>var(--gutter)){.${escaped}{color:red}}@media (width>8rpx){.${alias}{color:red}}`,
    }, [utility], [escaped], ['wxml'], 'condition')).toThrow(utility)
  })

  it('does not share resolved values across output snapshots', () => {
    expect(verify(':root{--gutter:8rpx}')[0]?.actualClass).toBe(alias)
    expect(() => verify(':root{--gutter:10rpx}')).toThrow(utility)
  })

  it('preserves multi-token bindings and nested calc structure', () => {
    expect(verify(':root{--gutter:8rpx 10rpx}', 'var(--gutter)', '8rpx 10rpx')[0]?.actualClass).toBe(alias)
    expect(verify(':root{--unit:8rpx;--gutter:calc(var(--unit) * 2.5)}', 'var(--gutter)', 'calc(8rpx * 2.5)')[0]?.actualClass).toBe(alias)
  })

  it('bounds deep or exponentially repeated variable dependencies', () => {
    const deep = Array.from({ length: 70 }, (_, index) => `--v${index}:var(--v${index + 1});`).join('')
    expect(() => verify(`:root{${deep}--v70:8rpx;--gutter:var(--v0)}`)).toThrow(utility)
    const repeated = Array.from({ length: 16 }, (_, index) => `--v${index}:var(--v${index + 1}) var(--v${index + 1});`).join('')
    expect(() => verify(`:root{${repeated}--v16:8rpx;--gutter:var(--v0)}`, 'var(--gutter)', Array.from({ length: 65_536 }).fill('8rpx').join(' '))).toThrow(utility)
  })

  it('bounds broad variable fan-out before concatenating cached signatures', () => {
    const leaf = Array.from({ length: 100 }).fill('8rpx').join(' ')
    const repeated = Array.from({ length: 100 }).fill('var(--leaf)').join(' ')
    const actual = Array.from({ length: 100 }).fill(leaf).join(' ')
    expect(() => verify(`:root{--leaf:${leaf};--gutter:${repeated}}`, 'var(--gutter)', actual)).toThrow(utility)
    expect(() => verify(`:root{--leaf:${leaf}}`, repeated, actual)).toThrow(utility)
  })
})
