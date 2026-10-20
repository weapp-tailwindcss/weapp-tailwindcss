import { describe, expect, it } from 'vitest'
import { compileNativeCss } from '../src/native'

describe('React Native 布局简写的顶层分词', () => {
  it.each([
    ['padding', 'calc(var(--spacing) * 4)', { paddingTop: 16, paddingRight: 16, paddingBottom: 16, paddingLeft: 16 }],
    ['margin', 'calc(var(--spacing) * -2) 13px', { marginTop: -8, marginRight: 13, marginBottom: -8, marginLeft: 13 }],
    ['padding', 'calc(0.25rem * 4)/**/7px 5% 3px', { paddingTop: 16, paddingRight: 7, paddingBottom: '5%', paddingLeft: 3 }],
  ])('%s:%s 保留函数内部空白与四边语义', (property, value, style) => {
    const result = compileNativeCss(`:root { --spacing: 0.25rem; } .probe { ${property}: ${value}; }`)
    expect(result.rules.probe?.[0]?.style).toEqual(style)
    expect(result.warnings).toEqual([])
  })

  it.each(['padding', 'margin'])('拒绝超过四项的 %s 而不是截断', (property) => {
    const value = '1px 2px 3px 4px 5px'
    const result = compileNativeCss(`.probe { ${property}: ${value}; }`)
    expect(result.rules.probe).toBeUndefined()
    expect(result.warnings).toEqual([{ className: 'probe', property, message: `不支持将 ${property}: ${value} 编译为 React Native style` }])
  })
})
