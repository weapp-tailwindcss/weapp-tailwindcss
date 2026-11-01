import type { Plugin } from 'postcss'
import type { IStyleHandlerOptions } from '../src/types'
import postcss from 'postcss'
import { describe, expect, it, vi } from 'vitest'
import { createStyleHandler } from '../src/handler'
import { createOptionsResolver } from '../src/options-resolver'
import { getPresetInsertionCacheState } from '../src/preset-insertion-cache-policy'
import { StyleProcessorCache } from '../src/processor-cache'

function options(plugin: Plugin, position: 'insertBefore' | 'insertAfter' = 'insertBefore') {
  return {
    cssPreflight: false as const,
    cssCalc: false as const,
    autoprefixer: false as const,
    cssPresetEnv: {
      stage: false as const,
      autoprefixer: false,
      [position]: { 'custom-properties': plugin },
    },
  }
}

class InjectedColor implements Plugin {
  postcssPlugin = 'inserted-private-color'
  #color: string

  constructor(color: string) {
    this.#color = color
  }

  prepare() {
    const color = this.#color
    return {
      Once(root: postcss.Root) {
        root.walkDecls('color', (declaration) => {
          declaration.value = color
        })
      },
    }
  }
}

describe('preset 插入插件的执行与缓存身份', () => {
  for (const position of ['insertBefore', 'insertAfter'] as const) {
    for (const mode of ['text', 'root'] as const) {
      it(`${position} 的同一插件闭包在 ${mode} 每轮重新执行`, async () => {
        let color = 'red'
        const prepare = vi.fn<NonNullable<Plugin['prepare']>>((result) => {
          const current = color
          result.messages.push({ type: 'dependency', plugin: 'inserted-color', file: `${current}.css` })
          return {
            Once(root) {
              root.walkDecls('color', (declaration) => {
                declaration.value = current
              })
            },
          }
        })
        const onDiagnostic = vi.fn()
        const plugin = { postcssPlugin: 'inserted-color', prepare }
        const handler = createStyleHandler({ ...options(plugin, position), onDiagnostic })
        const pipeline = handler.getPipeline()
        const root = postcss.parse('.a{color:black}', { from: 'same.css' })
        const run = () => mode === 'root' ? handler.transformRoot(root) : handler(root.toString())
        const first = await run()
        color = 'blue'
        const second = await run()
        expect(first.css).toContain('color:red')
        expect(second.css).toContain('color:blue')
        expect(prepare).toHaveBeenCalledTimes(2)
        expect(second.messages.filter(message => message.plugin === 'inserted-color')).toEqual([
          { type: 'dependency', plugin: 'inserted-color', file: 'blue.css' },
        ])
        expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(false)
        expect(handler.getPipeline()).toBe(pipeline)
        expect(root.toString()).toBe('.a{color:black}')
        if (mode === 'root') {
          expect(second.root).not.toBe(first.root)
          expect(second.root.first?.source?.input).toBe(root.first?.source?.input)
        }
      })
    }

    it(`${position} 在空 CSS 也执行首次生成`, async () => {
      const once = vi.fn<NonNullable<Plugin['Once']>>((root) => {
        root.append(postcss.rule({ selector: '.inserted', nodes: [postcss.decl({ prop: 'color', value: 'red' })] }))
      })
      const handler = createStyleHandler(options({ postcssPlugin: 'inserted-empty', Once: once }, position))
      expect((await handler('')).css).toContain('.inserted')
      expect(once).toHaveBeenCalledTimes(1)
    })

    it(`${position} 没有消息的 Root 结果也不跳过回调`, async () => {
      let color = 'red'
      const prepare = vi.fn<NonNullable<Plugin['prepare']>>(() => ({
        Once(root) {
          root.walkDecls('color', (declaration) => {
            declaration.value = color
          })
        },
      }))
      const handler = createStyleHandler(options({ postcssPlugin: 'inserted-root-color', prepare }, position))
      const root = postcss.parse('.a{color:black}', { from: 'same.css' })
      expect((await handler.transformRoot(root)).css).toContain('color:red')
      color = 'blue'
      expect((await handler.transformRoot(root)).css).toContain('color:blue')
      expect(prepare).toHaveBeenCalledTimes(2)
      expect(root.toString()).toBe('.a{color:black}')
    })
  }

  it('不同私有状态实例不能复用旧合并配置', () => {
    const resolver = createOptionsResolver({})
    const red = new InjectedColor('red')
    const blue = new InjectedColor('blue')
    const first = resolver.resolve(options(red))
    const second = resolver.resolve(options(blue))
    expect(first.cssPresetEnv?.insertBefore?.['custom-properties']).toBe(red)
    expect(second.cssPresetEnv?.insertBefore?.['custom-properties']).toBe(blue)
  })

  it('基线插入实例变化后，普通覆盖也必须取得新实例', () => {
    const red = new InjectedColor('red')
    const blue = new InjectedColor('blue')
    const base = options(red)
    const resolver = createOptionsResolver(base)
    const first = resolver.resolve({ isMainChunk: false })
    expect(first.cssPresetEnv?.insertBefore?.['custom-properties']).toBe(red)
    base.cssPresetEnv = { ...base.cssPresetEnv, insertBefore: { 'custom-properties': blue } }
    const second = resolver.resolve({ isMainChunk: false })
    expect(second.cssPresetEnv?.insertBefore?.['custom-properties']).toBe(blue)
  })

  it('processor 按实际插入实例区分，保留同实例复用', async () => {
    const cache = new StyleProcessorCache()
    const red = options(new InjectedColor('red'))
    const blue = options(new InjectedColor('blue'))
    const first = cache.getProcessor(red)
    const second = cache.getProcessor(blue)
    expect(second).not.toBe(first)
    expect(cache.getProcessor(blue)).toBe(second)
    expect((await first.process('.a{color:black}', { from: undefined })).css).toContain('color:red')
    expect((await second.process('.a{color:black}', { from: undefined })).css).toContain('color:blue')
  })

  it('新 map/数组外壳保留同插件复用，原位标量变化仍影响实际转换', async () => {
    const plugin = new InjectedColor('red')
    const cache = new StyleProcessorCache()
    const firstOptions: IStyleHandlerOptions = options(plugin)
    const first = cache.getProcessor(firstOptions)
    const secondOptions: IStyleHandlerOptions = {
      ...options(plugin),
      cssPresetEnv: { ...firstOptions.cssPresetEnv, insertBefore: { 'custom-properties': [plugin] } },
    }
    const second = cache.getProcessor(secondOptions)
    expect(cache.getProcessor({ ...secondOptions, cssPresetEnv: { ...secondOptions.cssPresetEnv, insertBefore: { 'custom-properties': [plugin] } } })).toBe(second)
    const before = await first.process('.a{background-color:#1234}', { from: undefined })
    firstOptions.cssPresetEnv!.stage = 0
    const changed = cache.getProcessor(firstOptions)
    expect(changed).not.toBe(first)
    expect((await changed.process('.a{background-color:#1234}', { from: undefined })).css).not.toBe(before.css)
  })

  it('缓存中的插入实例被替换后，恢复调用方实际配置', () => {
    const resolver = createOptionsResolver({})
    const red = new InjectedColor('red')
    const override = options(red)
    const cached = resolver.resolve(override)
    cached.cssPresetEnv = { ...cached.cssPresetEnv, insertBefore: { 'custom-properties': new InjectedColor('blue') } }
    expect(resolver.resolve(override).cssPresetEnv?.insertBefore?.['custom-properties']).toBe(red)
  })

  it('canonical cssOptions 同样使用本轮私有状态实例', async () => {
    const handler = createStyleHandler({ cssPreflight: false })
    const first = await handler('.a{color:black}', { cssOptions: options(new InjectedColor('red')) })
    const second = await handler('.a{color:black}', { cssOptions: options(new InjectedColor('blue')) })
    expect(first.css).toContain('color:red')
    expect(second.css).toContain('color:blue')
  })

  it('数组自定义展开访问器不在准入检查中求值', () => {
    const read = vi.fn(() => true)
    const plugins = [new InjectedColor('red')]
    Object.defineProperty(plugins, Symbol.isConcatSpreadable, { get: read })
    expect(getPresetInsertionCacheState({ insertBefore: { 'custom-properties': plugins } })).toEqual({ present: true, key: undefined })
    expect(read).not.toHaveBeenCalled()
  })

  it('插入 map 访问器不在准入检查中求值，实际调用重新获取插件', async () => {
    let plugin = new InjectedColor('red')
    const read = vi.fn(() => plugin)
    const preset = {
      stage: false as const,
      insertBefore: {
        get 'custom-properties'() {
          return read()
        },
      },
    }
    expect(getPresetInsertionCacheState(preset)).toEqual({ present: true, key: undefined })
    expect(read).not.toHaveBeenCalled()
    const handler = createStyleHandler({ cssPreflight: false })
    expect((await handler('.a{color:black}', { cssPresetEnv: preset })).css).toContain('color:red')
    plugin = new InjectedColor('blue')
    expect((await handler('.a{color:black}', { cssPresetEnv: preset })).css).toContain('color:blue')
  })

  for (const insertions of [undefined, { insertBefore: {}, insertAfter: {} }]) {
    it(`默认或空插入配置仍复用完整结果：${insertions === undefined ? 'default' : 'empty'}`, async () => {
      const onDiagnostic = vi.fn()
      const handler = createStyleHandler({ cssPreflight: false, cssPresetEnv: insertions, onDiagnostic })
      const first = await handler('.a{color:red}')
      const second = await handler('.a{color:red}')
      expect(second.css).toBe(first.css)
      expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(true)
    })
  }
})
