import { postcss } from '@weapp-tailwindcss/postcss'
import { describe, expect, it } from 'vitest'
import { removeTailwindV4GeneratedUserCssArtifacts as clean } from '@/generation/user-css'

const generated = '@layer theme { :root, :host { --color-red-500: red; --spacing: 0.25rem; } }'
const selectors = [
  ':root,:host',
  ':host,page,.tw-root,wx-root-portal-content',
  'page, .tw-root, :host, wx-root-portal-content',
  '  :host ,\n page , .tw-root ,\n wx-root-portal-content ',
  ':host',
  'page',
  '.tw-root',
  'wx-root-portal-content',
]

describe('生成主题声明清理', () => {
  it.each(selectors)('清理 %s 的生成声明，同时保留用户变量与覆盖顺序', (selector) => {
    const source = `${selector}{--color-red-500:red;--spacing:.25rem;--test-color:#006241;--brand-color:#123456;--color-custom:blue;--font-custom:serif;--color-red-500:purple;--test-color:green!important}`
    const css = clean(source, generated)
    const declarations: string[] = []
    postcss.parse(css).walkDecls((decl) => {
      declarations.push(decl.toString())
    })
    expect(declarations).toEqual([
      '--test-color:#006241',
      '--brand-color:#123456',
      '--color-custom:blue',
      '--font-custom:serif',
      '--color-red-500:purple',
      '--test-color:green!important',
    ])
    expect(clean(css, generated)).toBe(css)
  })

  it.each(selectors)('删除仅包含已确认生成声明的 %s 规则', (selector) => {
    expect(clean(`@layer theme { ${selector} { --color-red-500: red; --spacing: .25rem; } }`, generated).trim()).toBe('')
  })

  it.each(selectors)('没有生成来源或来源不可解析时保留 %s 的主题声明', (selector) => {
    const source = `${selector}{--color-custom:blue;--spacing:2rem}`
    expect(clean(source)).toBe(source)
    expect(clean(source, '.broken{')).toBe(source)
  })

  it('保留不同优先级的声明以及主题范围之外的用户规则', () => {
    const source = ':root,:host{--spacing:.25rem!important}.vendor{--spacing:.25rem;color:red}@media print{.vendor{color:blue}}'
    expect(clean(source, generated)).toBe(source)
  })
  it('保留用户覆盖后再次写回生成值的级联顺序', () => {
    expect(clean(':root,:host{--color-red-500:red;--color-red-500:purple;--color-red-500:red}', generated))
      .toBe(':root,:host{--color-red-500:purple;--color-red-500:red}')
  })

  it('条件生成规则不会清理其他条件下的变量', () => {
    const conditional = '@media screen{:root,:host{--spacing:.25rem}}'
    const source = ':root,:host{--spacing:.25rem}@media print{:root,:host{--spacing:.25rem}}'
    expect(clean(source, conditional)).toBe(source)
    expect(clean(conditional, conditional)).toBe('')
  })
})
