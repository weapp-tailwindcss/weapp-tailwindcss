import { describe, expect, it } from 'vitest'
import { compileNativeStylesheet } from '../src/compiler'
import { createNativeStyleRuntime, setStyleSheetFactory } from '../src/runtime'
import { mergeNativeManifests } from '../src/tailwind/merge'

const css = `
  :root { --color-brand: #123456; }
  @property --shadow { syntax: "*"; inherits: false; initial-value: 0 0 #0000; }
  @property --ring { syntax: "*"; inherits: false; initial-value: 0 0 #0000; }
  .shadow { --shadow: 0 10px 15px -3px var(--shadow-color, rgb(0 0 0 / 0.1)), 0 4px 6px -4px var(--shadow-color, rgb(0 0 0 / 0.1)); box-shadow: var(--ring), var(--shadow); }
  .brand { --shadow-color: var(--color-brand); }
  .red { --shadow-color: red; }
  .important { --shadow-color: blue !important; }
  .ring { --ring: 0 0 0 calc(2px + 1px) green; box-shadow: var(--ring), var(--shadow); }
  .clear { box-shadow: none; }
`

function shadow(color: string) {
  return [
    { offsetX: 0, offsetY: 10, blurRadius: 15, spreadDistance: -3, color },
    { offsetX: 0, offsetY: 4, blurRadius: 6, spreadDistance: -4, color },
  ]
}

describe('原生阴影变量在最终 class 级联后计算', () => {
  it('纯变量 modifier 与阴影组合，class token 顺序不改变 CSS 源顺序', () => {
    const manifest = compileNativeStylesheet(css)
    const runtime = createNativeStyleRuntime(manifest)
    expect(manifest.rules.brand).toBeDefined()
    expect(runtime.tw('shadow')).toEqual({ boxShadow: shadow('rgba(0, 0, 0, 0.1)') })
    expect(runtime.tw('shadow brand')).toEqual({ boxShadow: shadow('#123456') })
    expect(runtime.tw('brand shadow')).toEqual({ boxShadow: shadow('#123456') })
    expect(runtime.tw('red shadow brand')).toEqual({ boxShadow: shadow('red') })
    expect(runtime.tw('shadow')).toEqual({ boxShadow: shadow('rgba(0, 0, 0, 0.1)') })
  })

  it('important 自定义变量独立于 box-shadow 属性优先级，并覆盖后声明的普通变量', () => {
    const runtime = createNativeStyleRuntime(compileNativeStylesheet(`${css} .later { --shadow-color: orange; }`))
    expect(runtime.tw('shadow later important')).toEqual({ boxShadow: shadow('blue') })
    const value = runtime.tw('shadow later important')
    expect(runtime.composeStyle(value, { boxShadow: [] })).toEqual([value, { boxShadow: [] }])
  })

  it('important 阴影属性保留最终变量值，并覆盖 inline boxShadow', () => {
    const runtime = createNativeStyleRuntime(compileNativeStylesheet(`${css} .strong { box-shadow: var(--shadow) !important; }`))
    const value = runtime.tw('shadow brand strong')
    expect(value).toEqual({ boxShadow: shadow('#123456') })
    expect(runtime.composeStyle(value, { boxShadow: [] })).toEqual([value, { boxShadow: [] }, { boxShadow: shadow('#123456') }])
  })

  it('颜色 opacity modifier 在最终变量级联后转换为宿主 rgba', () => {
    const runtime = createNativeStyleRuntime(compileNativeStylesheet(`${css} .alpha { --shadow-color: color-mix(in oklab, var(--color-brand) 50%, transparent); }`))
    expect(runtime.tw('shadow alpha')).toEqual({ boxShadow: shadow('rgba(18, 52, 86, 0.5)') })
  })

  it('变量值无法表达为原生阴影时明确失败，不静默使用旧 fallback', () => {
    const runtime = createNativeStyleRuntime(compileNativeStylesheet(`${css} .bad { --shadow-color: not-a-color; }`))
    expect(() => runtime.tw('shadow bad')).toThrow('box-shadow')
  })

  it.each(['0 1px 2px currentColor', '0 1px 2px'])('currentColor 与省略颜色按最终 class 和 inline 颜色计算：%s', (value) => {
    const runtime = createNativeStyleRuntime(compileNativeStylesheet(`.shadow { box-shadow: ${value}; } .color { color: red; }`))
    expect(runtime.tw('shadow color')).toEqual({ color: 'red', boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 2, spreadDistance: 0, color: 'red' }] })
    const style = runtime.tw('shadow color')
    expect(runtime.composeStyle(style, { color: 'blue' })).toEqual([style, { color: 'blue' }, { boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 2, spreadDistance: 0, color: 'blue' }] }])
    expect(runtime.tw('shadow')).toEqual({})
    expect(runtime.tw('shadow', { color: 'green' })).toEqual({ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 2, spreadDistance: 0, color: 'green' }] })
    expect(runtime.tw('shadow', { color: 'blue' })).toEqual({ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 2, spreadDistance: 0, color: 'blue' }] })
  })

  it('important 文字颜色决定 currentColor，并保留 inline 阴影属性优先级', () => {
    const runtime = createNativeStyleRuntime(compileNativeStylesheet('.shadow { box-shadow: 0 1px currentColor; } .color { color: red !important; }'))
    const style = runtime.tw('shadow color')
    expect(runtime.composeStyle(style, { color: 'blue' })).toEqual([style, { color: 'blue' }, { color: 'red', boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 0, spreadDistance: 0, color: 'red' }] }])
    expect(runtime.composeStyle(style, { color: 'blue', boxShadow: [] })).toEqual([style, { color: 'blue', boxShadow: [] }, { color: 'red' }])
  })

  it('ring 与多层阴影互相组合，calc、spread 和 none 保持语义', () => {
    const runtime = createNativeStyleRuntime(compileNativeStylesheet(css))
    expect(runtime.tw('shadow brand ring')).toEqual({ boxShadow: [
      { offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 3, color: 'green' },
      ...shadow('#123456'),
    ] })
    expect(runtime.tw('shadow brand ring clear')).toEqual({ boxShadow: [] })
  })

  it('静态 lookup 与 StyleSheet 注册路径使用本次组合后的最终阴影', () => {
    setStyleSheetFactory(styles => Object.fromEntries(Object.keys(styles).map((id, index) => [id, index + 1])) as never)
    const manifest = compileNativeStylesheet(css)
    const runtime = createNativeStyleRuntime(manifest)
    const ids = ['shadow', 'brand'].flatMap(name => manifest.staticLookup![name]!)
    expect(runtime.getStaticStyle(ids)).toEqual({ boxShadow: shadow('#123456') })
    expect(runtime.tw('shadow red')).toEqual({ boxShadow: shadow('red') })
  })

  it('两个独立入口的主题默认值不会串到另一个入口的 modifier', () => {
    const first = compileNativeStylesheet(css)
    const second = compileNativeStylesheet(':root { --color-brand: #654321; } .other { --shadow-color: var(--color-brand); }')
    const manifest = mergeNativeManifests([first, second])
    const runtime = createNativeStyleRuntime(manifest)
    expect(runtime.tw('shadow brand')).toEqual({ boxShadow: shadow('#123456') })
    expect(runtime.tw('shadow other')).toEqual({ boxShadow: shadow('#654321') })
  })
})
