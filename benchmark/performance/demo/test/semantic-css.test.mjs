import autoprefixer from 'autoprefixer'
import postcss from 'postcss'
import { expect, it } from 'vitest'
import { comparableCss } from '../semantic-css.mjs'
import { canonicalStyleEvidence } from '../css-values.mjs'

it('真实 Autoprefixer 的旧 flex 回退被同规则后续标准声明覆盖，原始 CSS 不被修改', async () => {
  const source = '.flex{display:flex}'
  const raw = (await postcss([autoprefixer({ overrideBrowserslist: ['Android >= 4.1', 'ios >= 8'], flexbox: 'no-2009' })]).process(source, { from: undefined })).css
  expect(raw).toContain('display:-webkit-flex;display:flex')
  const compared = comparableCss(raw)
  expect(compared).not.toContain('-webkit-flex')
  expect(compared).toContain('display:flex')
  expect(raw).toContain('-webkit-flex')
})

it('不删除不同规则、条件、顺序或优先级中的前缀，也不抹去布局差异', () => {
  for (const css of [
    '.a{display:-webkit-flex}.b{display:flex}',
    '.a{display:-webkit-flex;@media(min-width:1px){display:flex}}',
    '.a{display:flex;display:-webkit-flex}',
    '.a{display:-webkit-flex!important;display:flex}',
    '.a{display:-webkit-flex;display:block}',
  ]) expect(comparableCss(css)).toBe(css)
  const raw = { rules: { flex: ['-webkit-flex', 'flex'], height: ['8rpx'] } }
  const comparisonProbes = { rules: { flex: ['flex'], height: ['8rpx'] } }
  expect(canonicalStyleEvidence({ probes: raw, comparisonProbes })).toEqual(canonicalStyleEvidence({ probes: comparisonProbes }))
  expect(canonicalStyleEvidence({ probes: raw, comparisonProbes: { rules: { flex: ['block'], height: ['9rpx'] } } }))
    .not.toEqual(canonicalStyleEvidence({ probes: comparisonProbes }))
})

it('根主题变量在相同具名层和等价根选择器中以后续声明为准，保留原始证据', () => {
  for (const css of [
    ':root, :host{--spacing:4px}:host,:root{--spacing:0.1rem}',
    '@layer theme{:root,:host{--spacing:4px}}@layer theme{:host,:root{--spacing:0.2rem}}',
  ]) {
    expect(comparableCss(css)).not.toContain('--spacing:4px')
    expect(comparableCss(css)).toContain('rem')
    expect(css).toContain('--spacing:4px')
  }
})

it('条件、作用域、选择器、层与优先级不同的主题值不得丢弃', () => {
  for (const css of [
    ':root{--spacing:4px}:host{--spacing:1rem}',
    ':root{--spacing:4px!important}:root{--spacing:1rem}',
    ':root{--spacing:4px}@media(min-width:1px){:root{--spacing:1rem}}',
    '@layer a{:root{--spacing:4px}}@layer b{:root{--spacing:1rem}}',
    '@layer{:root{--spacing:4px}}@layer{:root{--spacing:1rem}}',
    '@scope(.a){:root{--spacing:4px}}@scope(.b){:root{--spacing:1rem}}',
    '.page{--spacing:4px}:root{--spacing:1rem}',
  ]) expect(comparableCss(css)).toBe(css)
  expect(comparableCss(':root{--spacing:1rem}:root{--spacing:4px}')).toContain('--spacing:4px')
})
