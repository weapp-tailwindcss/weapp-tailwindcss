import { describe, expect, it } from 'vitest'
import { compileNativeCss } from '../src/native'

describe('React Native 0.81 布局关键字边界', () => {
  it.each(['fixed', 'sticky'])('position:%s 不能作为有效原生 style 输出', (value) => {
    const result = compileNativeCss(`.probe { position: ${value}; width: 13px; }`)
    expect(result.rules.probe).toMatchObject([{ style: { width: 13 } }])
    expect(result.rules.probe?.[0]?.style).not.toHaveProperty('position')
    expect(result.warnings).toEqual([{ className: 'probe', property: 'position', message: `不支持将 position: ${value} 编译为 React Native style` }])
  })

  it.each(['relative', 'absolute', 'static'])('position:%s 属于基线 API', (value) => {
    const result = compileNativeCss(`.probe { position: ${value}; }`)
    expect(result.rules.probe?.[0]?.style).toEqual({ position: value })
    expect(result.warnings).toEqual([])
  })

  it('RN 0.81 的 display:contents 保留编码，不推断宿主像素效果', () => {
    expect(compileNativeCss('.contents { display: contents; }').rules.contents?.[0]?.style).toEqual({ display: 'contents' })
  })

  it.each([
    ['align-items', 'normal'],
    ['align-items', 'safe center'],
    ['align-content', 'normal'],
    ['align-content', 'baseline'],
    ['align-self', 'last baseline'],
    ['justify-content', 'stretch'],
    ['justify-content', 'normal'],
    ['flex-direction', 'invalid'],
    ['flex-wrap', 'invalid'],
  ])('无效的 %s:%s 明确诊断并拒绝写入原生对象', (property, value) => {
    const result = compileNativeCss(`.probe { ${property}: ${value}; }`)
    expect(result.rules.probe).toBeUndefined()
    expect(result.warnings).toEqual([expect.objectContaining({ className: 'probe', message: `不支持将 ${property}: ${value} 编译为 React Native style` })])
  })
})
