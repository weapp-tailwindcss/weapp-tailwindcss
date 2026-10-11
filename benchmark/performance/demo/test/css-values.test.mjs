import { expect, it } from 'vitest'
import { canonicalCssValue, canonicalStyleEvidence } from '../css-values.mjs'

it('相同颜色与数值的压缩写法保持等价，去重发生在规范化之后', () => {
  const staticResult = { rules: { color: ['#62748e'], background: ['#ecfdf5cc'] }, spacing: ['.1rem', '.25rem'] }
  const enabledResult = { rules: { color: ['rgb(98,116,142)'], background: ['rgba(236,253,245,0.8)'] }, spacing: ['0.1rem', '0.25rem', '.25rem'] }
  expect(canonicalStyleEvidence(staticResult)).toEqual(canonicalStyleEvidence(enabledResult))
  expect(canonicalCssValue('calc(var(--spacing)*0.50)')).toBe(canonicalCssValue('calc(var(--spacing)*.5)'))
})

it('保留真实颜色、透明度、单位、变量与页面尺寸差异', () => {
  for (const [a, b] of [['#62748e', '#62748f'], ['#ecfdf5cc', '#ecfdf5cd'], ['.25rem', '.25px'], ['var(--spacing)', 'var(--gap)'], ['color(display-p3 1 0 0)', 'rgb(255,0,0)']]) expect(canonicalCssValue(a)).not.toBe(canonicalCssValue(b))
  expect(canonicalStyleEvidence({ topology: [{ height: '72px' }] })).not.toEqual(canonicalStyleEvidence({ topology: [{ height: '84px' }] }))
  expect(canonicalCssValue('"0.25rem"')).toBe('"0.25rem"')
})
