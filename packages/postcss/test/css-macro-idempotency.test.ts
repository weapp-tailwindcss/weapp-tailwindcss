import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import { transformCssMacroTailwindV4Source } from '../src/css-macro/auto'

const samples = [
  ['正向条件', '/* #ifdef H5 */ .web-only { color: red; } @custom-variant active { &:active { @slot; } } /* #endif */'],
  ['负向条件', '/* #ifndef MP */ .web-only { color: red; } @custom-variant active { &:active { @slot; } } /* #endif */'],
  ['内外不同条件', '/* #ifndef MP */ .web-only { color: red; } @custom-variant active { /* #ifdef H5 */ &:active { @slot; } /* #endif */ } /* #endif */'],
  ['嵌套外层条件', '/* #ifndef MP */ .web-only { color: red; } /* #ifdef H5 */ @custom-variant active { &:active { @slot; } } /* #endif */ /* #endif */'],
  ['保留包裹注释', '/* #ifdef H5 */ .web-only { color: red; } @custom-variant active { /* 作者说明 */ @weapp-tw-ifdef "H5" { &:active { @slot; } } } /* #endif */'],
] as const

describe('混合条件中的 variant 准备幂等性', () => {
  it.each(samples)('%s 连续准备保留相同条件和普通规则', (_name, source) => {
    const prepared = transformCssMacroTailwindV4Source(source)
    expect(prepared).toContain('.web-only')
    expect(prepared).toContain('/* #endif */')
    const root = postcss.parse(prepared)
    expect(root.nodes[0]?.type).toBe('comment')
    expect(root.nodes[1]?.type).toBe('rule')
    if (source.includes('作者说明')) {
      expect(prepared).toContain('/* 作者说明 */')
    }
    for (let iteration = 0, result = prepared; iteration < 3; iteration += 1) {
      result = transformCssMacroTailwindV4Source(result)
      expect(result).toBe(prepared)
    }
  })

  it.each([
    ['不同条件', '@weapp-tw-ifdef "APP" { @slot; }'],
    ['不同方向', '@weapp-tw-ifndef "H5" { @slot; }'],
    ['条件外仍有 slot', '@weapp-tw-ifdef "H5" { &:hover { @slot; } } &:focus { @slot; }'],
    ['深层条件分叉', '@weapp-tw-ifdef "APP" { @weapp-tw-ifdef "H5" { &:hover { @slot; } } &:focus { @slot; } }'],
  ])('%s 仍应补充缺失的外层条件', (_name, body) => {
    const source = `/* #ifdef H5 */ .web-only { color: red; } @custom-variant active { ${body} } /* #endif */`
    const prepared = transformCssMacroTailwindV4Source(source)
    const root = postcss.parse(prepared)
    root.walkAtRules('custom-variant', (variant) => {
      const wrapper = variant.nodes?.[0]
      expect(wrapper?.type).toBe('atrule')
      if (wrapper?.type === 'atrule') {
        expect(wrapper.name).toBe('weapp-tw-ifdef')
        expect(wrapper.params).toBe('"H5"')
        expect(wrapper.nodes?.length).toBeGreaterThan(0)
      }
    })
    expect(transformCssMacroTailwindV4Source(prepared)).toBe(prepared)
  })

  it('每个 variant 分别补全条件，同时保留已有的不同方向', () => {
    const source = '/* #ifdef H5 */ .web-only { color: red; } @custom-variant first { @weapp-tw-ifdef "H5" { @slot; } } @custom-variant second { @weapp-tw-ifndef "H5" { @slot; } } /* #endif */'
    const prepared = transformCssMacroTailwindV4Source(source)
    const wrappers: string[][] = []
    postcss.parse(prepared).walkAtRules('custom-variant', (variant) => {
      const rules: string[] = []
      variant.walkAtRules((rule) => {
        rules.push(`${rule.name} ${rule.params}`)
      })
      wrappers.push(rules)
    })
    expect(wrappers).toEqual([
      ['weapp-tw-ifdef "H5"', 'slot '],
      ['weapp-tw-ifdef "H5"', 'weapp-tw-ifndef "H5"', 'slot '],
    ])
    expect(transformCssMacroTailwindV4Source(prepared)).toBe(prepared)
  })
})
