import { afterEach, describe, expect, it } from 'vitest'
import { compileNativeStylesheet } from '../src/compiler'
import { createNativeStyleRuntime, setStyleSheetFactory } from '../src/runtime'
import { flattenInlineStyle } from '../src/runtime/line-height'

afterEach(() => {
  setStyleSheetFactory(styles => styles)
})

describe('原生运行时的注册表、缓存与组合元数据归属于实例', () => {
  it('注册路径的 tw 与静态查询保留普通和 important 的完整级联', () => {
    setStyleSheetFactory(styles => styles)
    const manifest = compileNativeStylesheet('.normal { width: 4px; color: blue; } .strong { color: red !important; }')
    const runtime = createNativeStyleRuntime(manifest)
    expect(flattenInlineStyle(runtime.tw('normal strong'))).toEqual({ width: 4, color: 'red' })
    expect(flattenInlineStyle(runtime.getStaticStyle(['normal', 'strong'].flatMap(name => manifest.staticLookup![name]!)))).toEqual({ width: 4, color: 'red' })
  })

  it('相同稳定 ID 的两个 manifest 不得共享注册结果', () => {
    setStyleSheetFactory(styles => styles)
    const first = createNativeStyleRuntime(compileNativeStylesheet('.probe { color: red; }'))
    const second = createNativeStyleRuntime(compileNativeStylesheet('.probe { color: blue; }'))
    expect(first.tw('probe')).toEqual({ color: 'red' })
    expect(second.tw('probe')).toEqual({ color: 'blue' })
    expect(first.getStaticStyle(first.getManifest()!.staticLookup!.probe!)).toEqual({ color: 'red' })
  })

  it('另一个实例更新 manifest 不能删除已返回样式的 important 和相对值信息', () => {
    setStyleSheetFactory(styles => styles)
    const first = createNativeStyleRuntime(compileNativeStylesheet('.probe { color: red !important; line-height: 1.5; box-shadow: 0 1px currentColor; }'))
    const style = first.tw('probe')
    const second = createNativeStyleRuntime(compileNativeStylesheet('.probe { color: blue; }'))
    second.setManifest(compileNativeStylesheet('.probe { color: green; }'))
    const inline = { color: 'blue', fontSize: 20 }
    expect(first.composeStyle(style, inline)).toEqual([style, inline, {
      color: 'red',
      lineHeight: 30,
      boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 0, spreadDistance: 0, color: 'red' }],
    }])
  })

  it('宿主注册器变化时每个实例惰性重建注册表并清除旧缓存', () => {
    const manifest = compileNativeStylesheet('.probe { color: red; }')
    setStyleSheetFactory(styles => Object.fromEntries(Object.keys(styles).map(id => [id, 1])))
    const first = createNativeStyleRuntime(manifest)
    const second = createNativeStyleRuntime(manifest)
    expect(first.tw('probe')).toBe(1)
    expect(second.tw('probe')).toBe(1)
    setStyleSheetFactory(styles => Object.fromEntries(Object.keys(styles).map(id => [id, 2])))
    expect(first.tw('probe')).toBe(2)
    expect(second.getStaticStyle(manifest.staticLookup!.probe!)).toBe(2)
  })
})
