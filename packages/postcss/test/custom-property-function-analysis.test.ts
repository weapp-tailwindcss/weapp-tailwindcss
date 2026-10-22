import { tokenize } from '@csstools/css-tokenizer'
import postcss from 'postcss'
import valueParser from 'postcss-value-parser'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { collectCustomPropertyValues } from '../src/compat/web-css-custom-properties'
import { getCssCalcVariableReferences, hasCssFunction } from '../src/utils/css-custom-property'

vi.mock('@csstools/css-tokenizer', async (importOriginal) => {
  const original = await importOriginal<typeof import('@csstools/css-tokenizer')>()
  return { ...original, tokenize: vi.fn(original.tokenize) }
})

vi.mock('postcss-value-parser', async (importOriginal) => {
  const original = await importOriginal<typeof import('postcss-value-parser')>()
  return { ...original, default: Object.assign(vi.fn(original.default), original.default) }
})

afterEach(() => vi.clearAllMocks())

describe('自定义属性分析只解析可能包含目标函数的值', () => {
  it('普通颜色和数学函数不反复构造变量或 attr 的语法树', () => {
    for (const value of ['oklch(.6 .2 240)', 'rgb(1 2 3 / 50%)', 'calc(2 * (1px + 3px))', 'linear-gradient(red, blue)']) {
      expect([...getCssCalcVariableReferences(value)]).toEqual([])
      expect(hasCssFunction(value, 'attr')).toBe(false)
    }
    expect(valueParser).not.toHaveBeenCalled()
    expect(tokenize).not.toHaveBeenCalled()
  })

  it('完整主题的无变量函数值直接保留，不为每个颜色构造两份 AST', () => {
    const values = Array.from({ length: 128 }, (_, index) => [`--color-${index}`, `oklch(.6 .2 ${index})`] as const)
    const root = postcss.parse(`:root { ${values.map(([name, value]) => `${name}: ${value};`).join(' ')} }`)
    vi.clearAllMocks()
    expect([...collectCustomPropertyValues(root).values]).toEqual(values)
    expect(valueParser).not.toHaveBeenCalled()
    expect(tokenize).not.toHaveBeenCalled()
  })

  it.each([
    ['VAR(--brand)', [['--brand', '--brand']]],
    ['calc(1px + var(--space, var(--fallback)))', [['--space', '--space'], ['--fallback', '--fallback']]],
    [String.raw`v\61 r(--brand)`, [['--brand', '--brand']]],
    [String.raw`var(--br\61 nd)`, [[String.raw`--br\61 nd`, '--brand']]],
  ])('潜在函数 %s 仍通过完整解析确认身份', (value, references) => {
    expect([...getCssCalcVariableReferences(value)]).toEqual(references)
    expect(valueParser).toHaveBeenCalled()
  })

  it.each(['ATTR(data-color)', String.raw`\61 ttr(data-color)`, 'calc(1 + attr(data-count type(<number>)))'])('保留 %s 的元素求值边界', (value) => {
    expect(hasCssFunction(value, 'attr')).toBe(true)
    expect(tokenize).toHaveBeenCalled()
    expect(collectCustomPropertyValues(postcss.parse(`:root { --brand: ${value}; }`)).values.has('--brand')).toBe(false)
  })

  it.each(['INITIAL', 'initial/* ( */', String.raw`\69 nitial`])('CSS-wide 关键字 %s 仍不得静态化', (value) => {
    expect(collectCustomPropertyValues(postcss.parse(`:root { --brand: ${value}; }`)).values.has('--brand')).toBe(false)
  })
})
