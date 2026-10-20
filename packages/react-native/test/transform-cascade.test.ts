import { describe, expect, it } from 'vitest'
import { compileNativeStylesheet } from '../src/compiler'
import { createNativeStyleRuntime } from '../src/runtime'
import { mergeNativeManifests } from '../src/tailwind/merge'

const css = `
  .x { --x: skewX(6deg); transform: var(--x,) var(--y,); }
  .y { --y: skewY(3deg); transform: var(--x,) var(--y,); }
  .strong { --x: skewX(12deg) !important; }
  .later { --x: skewX(9deg); }
  .none { transform: none; }
`

describe('原生 transform 在最终变量级联后计算', () => {
  it('双轴 skew 合成不能丢失先声明的一轴，静态与动态路径一致', () => {
    const manifest = compileNativeStylesheet(css)
    const runtime = createNativeStyleRuntime(manifest)
    const expected = { transform: [{ skewX: '6deg' }, { skewY: '3deg' }] }
    expect(runtime.tw('x y')).toEqual(expected)
    expect(runtime.tw('y x')).toEqual(expected)
    expect(runtime.getStaticStyle(['x', 'y'].flatMap(name => manifest.staticLookup![name]!))).toEqual(expected)
    expect(runtime.tw('x y strong later')).toEqual({ transform: [{ skewX: '12deg' }, { skewY: '3deg' }] })
    expect(runtime.tw('x y none')).toEqual({ transform: [] })
  })

  it('独立入口变量与 important transform 按 CSS 顺序组合', () => {
    const manifest = mergeNativeManifests([
      compileNativeStylesheet(':root { --angle: 6deg; } .x { --x: skewX(var(--angle)); transform: var(--x,) var(--y,) !important; }'),
      compileNativeStylesheet(':root { --angle: 3deg; } .y { --y: skewY(var(--angle)); }'),
    ])
    const runtime = createNativeStyleRuntime(manifest)
    const style = runtime.tw('x y')
    expect(style).toEqual({ transform: [{ skewX: '6deg' }, { skewY: '3deg' }] })
    expect(runtime.composeStyle(style, { transform: [] })).toEqual([style, { transform: [] }, style])
  })

  it('不支持的 transform 函数不能被局部正则忽略而生成成功结果', () => {
    const manifest = compileNativeStylesheet('.bad { transform: skewX(6deg) unknown(2); }')
    expect(manifest.rules.bad).toBeUndefined()
    expect(manifest.warnings).toContainEqual(expect.objectContaining({ className: 'bad', property: 'transform' }))
  })
})
