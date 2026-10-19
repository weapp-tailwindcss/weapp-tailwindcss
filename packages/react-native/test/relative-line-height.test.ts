import { describe, expect, it } from 'vitest'
import { compileNativeStylesheet } from '../src/compiler'
import { createNativeStyleRuntime, setStyleSheetFactory } from '../src/runtime'

describe('原生相对行高', () => {
  it('字号与行高分属不同 utility，仍按最终字号换算并支持静态 lookup', () => {
    const manifest = compileNativeStylesheet('.leading { line-height: 1.25; } .size { font-size: 23px; }')
    const runtime = createNativeStyleRuntime(manifest)
    expect(runtime.tw('size leading')).toEqual({ fontSize: 23, lineHeight: 28.75 })
    expect(runtime.getStaticStyle(['leading', 'size'].flatMap(name => manifest.staticLookup![name]!))).toEqual({ fontSize: 23, lineHeight: 28.75 })
    expect(manifest.rules.leading?.[0]?.style).toEqual({})
    expect(manifest.rules.leading?.[0]).toHaveProperty('lineHeightMultiplier', 1.25)
  })

  it('important 字号在最终级联后决定相对行高，绝对行高可覆盖相对规则', () => {
    const manifest = compileNativeStylesheet('.leading { line-height: 1.25; } .large { font-size: 40px !important; } .size { font-size: 23px; } .absolute { line-height: 31px; }')
    const runtime = createNativeStyleRuntime(manifest)
    expect(runtime.tw('large size leading')).toEqual({ fontSize: 40, lineHeight: 50 })
    expect(runtime.tw('size leading absolute')).toEqual({ fontSize: 23, lineHeight: 31 })
  })

  it('inline 字号改变时重新计算，inline 绝对行高保留优先级', () => {
    const runtime = createNativeStyleRuntime(compileNativeStylesheet('.leading { line-height: 1.25; } .size { font-size: 23px; }'))
    const style = runtime.tw('size leading')
    expect(runtime.composeStyle(style, { fontSize: 40 })).toEqual([style, { fontSize: 40 }, { lineHeight: 50 }])
    expect(runtime.composeStyle(style, { fontSize: 40, lineHeight: 60 })).toEqual([style, { fontSize: 40, lineHeight: 60 }])
  })

  it('important 行高覆盖 inline 行高，但仍采用 inline 最终字号', () => {
    const runtime = createNativeStyleRuntime(compileNativeStylesheet('.leading { line-height: 1.25 !important; } .size { font-size: 23px; }'))
    const style = runtime.tw('size leading')
    expect(runtime.composeStyle(style, { fontSize: 40, lineHeight: 60 })).toEqual([style, { fontSize: 40, lineHeight: 60 }, { lineHeight: 50 }])
  })

  it.each(['125%', '1.25em', 'var(--leading)'])('相对单位和主题变量使用相同字号上下文：%s', (value) => {
    const runtime = createNativeStyleRuntime(compileNativeStylesheet(`:root { --leading: 1.25; } .leading { line-height: ${value}; } .size { font-size: 23px; }`))
    expect(runtime.tw('size leading')).toEqual({ fontSize: 23, lineHeight: 28.75 })
  })

  it('没有字号时不伪造像素值，并可显式提供继承字号上下文', () => {
    const runtime = createNativeStyleRuntime(compileNativeStylesheet('.leading { line-height: 1.25; }'))
    expect(runtime.tw('leading')).toEqual({})
    expect(runtime.tw('leading', { fontSize: 20 })).toEqual({ lineHeight: 25 })
    expect(runtime.tw('leading', { fontSize: 40 })).toEqual({ lineHeight: 50 })
    const style = runtime.tw('leading')
    expect(runtime.composeStyle(style, { fontSize: 23 })).toEqual([style, { fontSize: 23 }, { lineHeight: 28.75 }])
  })

  it('注入 StyleSheet factory 后仍返回包含最终行高的有效原生样式', () => {
    setStyleSheetFactory(styles => Object.fromEntries(Object.keys(styles).map((id, index) => [id, index + 1])) as never, style => typeof style === 'number' && style === 88 ? { fontSize: 40 } : undefined)
    const manifest = compileNativeStylesheet('.leading { line-height: 1.25; } .size { font-size: 23px; }')
    const runtime = createNativeStyleRuntime(manifest)
    expect(runtime.tw('leading size')).toEqual({ fontSize: 23, lineHeight: 28.75 })
    const style = runtime.tw('leading size')
    expect(runtime.composeStyle(style, 88)).toEqual([style, 88, { lineHeight: 50 }])
  })
})
