import { afterEach, describe, expect, it } from 'vitest'
import { compileNativeStylesheet } from '../src/compiler'
import { createNativeStyleRuntime, setStyleSheetFactory } from '../src/runtime'
import { flattenInlineStyle } from '../src/runtime/line-height'

const modes = [
  { lookup: 'dynamic', registered: false },
  { lookup: 'static', registered: false },
  { lookup: 'dynamic', registered: true },
  { lookup: 'static', registered: true },
] as const

const properties = [
  {
    name: '相对行高',
    concrete: 'line-height: 20px',
    deferred: 'line-height: 1.5',
    inline: { fontSize: 24, lineHeight: 99 },
    environment: { fontSize: 24 },
    resolved: { lineHeight: 36 },
    original: { lineHeight: 20 },
  },
  {
    name: 'currentColor 阴影',
    concrete: 'box-shadow: 0 1px red',
    deferred: 'box-shadow: 0 2px currentColor',
    inline: { color: 'blue', boxShadow: [] },
    environment: { color: 'blue' },
    resolved: { boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 0, spreadDistance: 0, color: 'blue' }] },
    original: { boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 0, spreadDistance: 0, color: 'red' }] },
  },
]

afterEach(() => {
  setStyleSheetFactory(styles => styles)
})

function createProbe(mode: typeof modes[number], css: string) {
  const registered = new Map<number, Record<string, unknown>>()
  setStyleSheetFactory((styles) => {
    if (!mode.registered) {
      return styles
    }
    return Object.fromEntries(Object.entries(styles).map(([id, style], index) => {
      registered.set(index + 1, style)
      return [id, index + 1]
    }))
  }, value => typeof value === 'number' ? registered.get(value) : undefined)
  const manifest = compileNativeStylesheet(css)
  const runtime = createNativeStyleRuntime(manifest)
  const resolve = (environment = {}) => mode.lookup === 'dynamic'
    ? runtime.tw('later earlier', environment)
    : runtime.getStaticStyle(['later', 'earlier'].flatMap(name => manifest.staticLookup![name]!), environment)
  return { runtime, resolve, flatten: (value: unknown) => flattenInlineStyle(value, id => registered.get(id)) }
}

describe.each(modes)('延迟 important 值覆盖已结算值：$lookup / registered=$registered', (mode) => {
  it.each(properties)('$name 缺少上下文时不恢复旧值，补足上下文后使用获胜声明', ({ concrete, deferred, inline, environment, resolved }) => {
    const { runtime, resolve } = createProbe(mode, `
      .earlier { ${concrete} !important; opacity: 0.8 !important; }
      .later { ${deferred} !important; }
    `)
    const style = resolve()
    expect(style).toEqual({ opacity: 0.8 })
    expect(runtime.composeStyle(style, { opacity: 0.5 })).toEqual([style, { opacity: 0.5 }, { opacity: 0.8 }])
    expect(runtime.composeStyle(style, { ...inline, opacity: 0.5 })).toEqual([
      style,
      { ...inline, opacity: 0.5 },
      { opacity: 0.8, ...resolved },
    ])
    expect(resolve(environment)).toEqual({ opacity: 0.8, ...resolved })
    expect(runtime.composeStyle(style, { opacity: 0.5 })).toEqual([style, { opacity: 0.5 }, { opacity: 0.8 }])
  })

  it.each(properties)('$name 保留重要绝对值对普通延迟值的优先级，并支持后声明绝对值覆盖', ({ concrete, deferred, inline, original }) => {
    for (const css of [
      `.earlier { ${concrete} !important; } .later { ${deferred}; }`,
      `.earlier { ${deferred} !important; } .later { ${concrete} !important; }`,
    ]) {
      const { runtime, resolve, flatten } = createProbe(mode, css)
      const style = resolve()
      expect(flatten(style)).toEqual(original)
      expect(flatten(runtime.composeStyle(style, inline))).toEqual({ ...inline, ...original })
    }
  })

  it.each(properties)('$name 同一规则内后声明的延迟值也不能重放旧值', ({ concrete, deferred, inline, resolved }) => {
    const { runtime, resolve } = createProbe(mode, `.earlier { ${concrete} !important; ${deferred} !important; } .later { opacity: 0.8 !important; }`)
    const style = resolve()
    expect(style).toEqual({ opacity: 0.8 })
    expect(runtime.composeStyle(style, { opacity: 0.5 })).toEqual([style, { opacity: 0.5 }, { opacity: 0.8 }])
    expect(runtime.composeStyle(style, inline)).toEqual([style, inline, { opacity: 0.8, ...resolved }])
  })
})
