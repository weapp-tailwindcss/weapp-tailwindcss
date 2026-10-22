import postcss from 'postcss'
import { expect, it } from 'vitest'
import { expectColorDeclarations } from './fixtures/web-color-declarations'

const fallback = 'rgb(251, 44, 54)'
const dynamic = 'color-mix(in oklab, oklch(63.7% 0.237 25.331) var(--tw-shadow-alpha), transparent)'
const property = '--tw-shadow-color'
const rule = (values: string[]) => `.probe{${values.map(value => `${property}:${value}`).join(';')}}`

it('颜色合同允许等价空白和相邻同值重复，保持完整声明顺序', () => {
  expectColorDeclarations(postcss.parse(rule([
    'rgb(251,44,54)',
    fallback,
    'color-mix( in oklab,oklch(63.7% 0.237 25.331) var(--tw-shadow-alpha),transparent )',
  ])), '.probe', property, [fallback, dynamic])
})

it.each([
  ['数字 token 碰撞', rule([fallback, dynamic.replace('0.237 25.331', '0.2372 5.331')])],
  ['自定义变量大小写', rule([fallback, dynamic.replace('--tw-shadow-alpha', '--TW-shadow-alpha')])],
  ['尾部 fallback 覆盖动态值', rule([fallback, dynamic, fallback])],
  ['声明顺序反转', rule([dynamic, fallback])],
  ['缺少 fallback', rule([dynamic])],
  ['未登记的附加颜色', rule([fallback, dynamic, 'blue'])],
  ['只有现代条件内的 fallback', `@supports(color:color-mix(in oklab,red,blue)){${rule([fallback, dynamic])}}`],
  ['嵌套子选择器冒充父级声明', `.probe{.child{${property}:${fallback};${property}:${dynamic}}}`],
])('颜色合同拒绝%s', (_, css) => {
  expect(() => expectColorDeclarations(postcss.parse(css), '.probe', property, [fallback, dynamic])).toThrow()
})

it('变体每条声明均须保留媒体条件', () => {
  const condition = /@media\(hover:\s*hover\)/
  expectColorDeclarations(postcss.parse(`@media(hover:hover){${rule([fallback, dynamic])}}`), '.probe', property, [fallback, dynamic], condition)
  for (const css of [
    rule([fallback, dynamic]),
    `${rule([fallback])}@media(hover:hover){${rule([dynamic])}}`,
  ]) {
    expect(() => expectColorDeclarations(postcss.parse(css), '.probe', property, [fallback, dynamic], condition)).toThrow()
  }
})
