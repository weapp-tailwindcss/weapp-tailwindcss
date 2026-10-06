import { getCssCalcVariableReferences } from '../src/utils/css-custom-property'

describe('CSS 变量引用身份', () => {
  it.each([
    [String.raw`var(--\74 w-leading,2)`, [[String.raw`--\74 w-leading`, '--tw-leading']]],
    [String.raw`var(--\74w-leading,2)`, [[String.raw`--\74w-leading`, '--tw-leading']]],
    [String.raw`v\61 r(--tw-leading,2)`, [['--tw-leading', '--tw-leading']]],
    [String.raw`v\61 r(--\74 w-leading,2)`, [[String.raw`--\74 w-leading`, '--tw-leading']]],
    [String.raw`var(/**/--\74 w-leading/**/,var(--text-xs))`, [[String.raw`/**/--\74 w-leading/**/`, '--tw-leading'], ['--text-xs', '--text-xs']]],
    [String.raw`calc(var(--\74 w-leading) + var(--tw-leading))`, [[String.raw`--\74 w-leading`, '--tw-leading'], ['--tw-leading', '--tw-leading']]],
    [String.raw`"var(--\74 w-leading)"`, []],
    [String.raw`url("var(--\74 w-leading)")`, []],
  ])('只收集完整引用，不产生转义截断的伪依赖：%s', (value, references) => {
    expect([...getCssCalcVariableReferences(value)]).toEqual(references)
  })

  it('保留已有非标准参数的保守依赖，避免 calc 误认为无依赖', () => {
    expect([...getCssCalcVariableReferences(String.raw`var(--\74 w-leading unexpected,2)`)]).toEqual([
      [String.raw`--\74 w-leading unexpected`, String.raw`--\74 w-leading unexpected`],
    ])
  })
})
