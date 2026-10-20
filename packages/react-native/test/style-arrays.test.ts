import { afterEach, describe, expect, it } from 'vitest'
import { compileNativeStylesheet } from '../src/compiler'
import { createNativeStyleRuntime, setStyleSheetFactory } from '../src/runtime'
import { flattenInlineStyle } from '../src/runtime/line-height'

afterEach(() => {
  setStyleSheetFactory(styles => styles)
})

describe('内联 style 数组边界', () => {
  it('数组叶子的注册 ID 由宿主解析，不能把嵌套数组交给递归宿主展开', () => {
    setStyleSheetFactory(styles => styles, (value) => {
      if (Array.isArray(value)) {
        throw new TypeError('宿主不负责展开嵌套数组')
      }
      return value === 88 ? { fontSize: 20, color: 'blue' } : undefined
    })
    const runtime = createNativeStyleRuntime(compileNativeStylesheet('.probe { line-height: 1.5; box-shadow: 0 1px currentColor; }'))
    const style = runtime.tw('probe')
    const composed = runtime.composeStyle(style, [false, [88]]) as unknown[]
    expect(composed[2]).toEqual({ lineHeight: 30, boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 0, spreadDistance: 0, color: 'blue' }] })
  })

  it('深层数组按 RN 顺序展开，不依赖 JS 调用栈深度', () => {
    let nested: unknown = { fontSize: 20, color: 'blue' }
    for (let index = 0; index < 20000; index++) {
      nested = [false, nested]
    }
    const runtime = createNativeStyleRuntime(compileNativeStylesheet('.probe { line-height: 1.5; box-shadow: 0 1px currentColor; }'))
    const style = runtime.tw('probe')
    const composed = runtime.composeStyle(style, nested) as unknown[]
    expect(composed[2]).toEqual({ lineHeight: 30, boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 0, spreadDistance: 0, color: 'blue' }] })
  })

  it('共享子数组允许重复出现，后项覆盖前项；真正循环明确诊断', () => {
    const shared = [{ color: 'red' }]
    expect(flattenInlineStyle([shared, { color: 'blue' }, shared])).toEqual({ color: 'red' })
    const circular: unknown[] = []
    circular.push(circular)
    expect(() => flattenInlineStyle(circular)).toThrow('循环')
  })
})
