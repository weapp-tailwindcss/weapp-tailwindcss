import { describe, expect, it } from 'vitest'
import { compileNativeCss } from '../src/native'

describe('原生字体主题值', () => {
  it('把 Tailwind 字重主题变量解析为 RN 接受的字符串值', () => {
    const result = compileNativeCss(':root { --font-weight-bold: 700; } .font-bold { font-weight: var(--font-weight-bold); font-style: italic; }')
    expect(result.rules['font-bold']?.[0]?.style).toEqual({ fontWeight: '700', fontStyle: 'italic' })
    expect(result.warnings).toEqual([])
  })

  it('递归解析主题别名与嵌套 fallback，已定义变量不残留括号', () => {
    const result = compileNativeCss(`
      :root { --font-weight-bold: 700; --font-weight-heading: var(--font-weight-bold); }
      .heading { font-weight: var(--font-weight-heading); }
      .fallback { font-weight: var(--missing, var(--font-weight-bold)); }
      .defined { font-weight: var(--font-weight-bold, var(--missing)); }
    `)
    for (const name of ['heading', 'fallback', 'defined']) {
      expect(result.rules[name]?.[0]?.style).toEqual({ fontWeight: '700' })
    }
    expect(result.warnings).toEqual([])
  })

  it('未解析变量与循环变量必须产生告警，不能传给原生样式', () => {
    const result = compileNativeCss(':root { --a: var(--b); --b: var(--a); } .missing { font-weight: var(--missing); } .cycle { font-weight: var(--a); }')
    expect(result.rules).toEqual({})
    expect(result.warnings).toEqual([
      expect.objectContaining({ className: 'missing', property: 'fontWeight' }),
      expect.objectContaining({ className: 'cycle', property: 'fontWeight' }),
    ])
  })
})
