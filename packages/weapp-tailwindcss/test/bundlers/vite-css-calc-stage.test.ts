import type { InternalUserDefinedOptions } from '@/types'
import { createStyleHandler, postcss } from '@weapp-tailwindcss/postcss/transform'
import { describe, expect, it } from 'vitest'
import { createViteCssCalcStage } from '@/bundlers/vite/css-calc-stage'

function options() {
  const style = {
    cssCalc: ['--spacing'],
    rem2rpx: true,
    cssPreflight: false,
    cssOptions: { cssCalc: ['--spacing'], rem2rpx: true },
  }
  return { ...style, styleHandler: createStyleHandler(style), tailwindRuntime: { majorVersion: 4 }, generator: { target: 'weapp' } } as unknown as InternalUserDefinedOptions
}

describe('Vite 构建 calc 阶段', () => {
  it('读取无关选项不触发样式阶段解析，真正的样式读取仍使用当前配置', () => {
    const original = options()
    original.cssCalc = undefined
    original.cssOptions = undefined
    const platform = vi.fn(() => 'mp-weixin')
    const stage = createViteCssCalcStage(original, () => true, platform)
    for (let index = 0; index < 100; index++) {
      expect(stage.options.tailwindRuntime).toBe(original.tailwindRuntime)
      expect(stage.options.generator).toBe(original.generator)
    }
    expect(platform).not.toHaveBeenCalled()
    expect(stage.options.cssCalc).toBe(false)
    expect(platform).toHaveBeenCalled()
    original.cssCalc = false
    expect(stage.shouldDefer()).toBe(false)
  })
  it('同时隔离生成器配置和已捕获配置的处理器，不修改原选项', async () => {
    const original = options()
    const stage = createViteCssCalcStage(original, () => true)
    const source = ':root{--spacing:1rem}.w{width:calc(var(--spacing)*32)}'
    expect(stage.options.cssCalc).toBe(false)
    expect(stage.options.cssOptions?.cssCalc).toBe(false)
    expect(stage.options.rem2rpx).toBe(false)
    expect(stage.options.cssOptions?.rem2rpx).toBe(false)
    const result = await stage.options.styleHandler(source, { cssCalc: true, rem2rpx: true })
    expect(result.css).toContain('calc(var(--spacing)*32)')
    expect(result.css).toContain('--spacing:1rem')
    expect(result.css).not.toContain('rpx')
    const root = await stage.options.styleHandler.transformRoot(postcss.parse(source))
    expect(root.css).toContain('calc(var(--spacing)*32)')
    expect(original.cssCalc).toEqual(['--spacing'])
    expect(stage.getFinalOptions()?.cssCalc).toEqual(['--spacing'])
  })

  it('仅构建且启用 cssCalc 时延迟，serve 和显式关闭保留配置', async () => {
    const original = options()
    let build = false
    const stage = createViteCssCalcStage(original, () => build)
    const source = ':root{--spacing:1rpx}.w{width:calc(var(--spacing)*32)}'
    expect((await stage.options.styleHandler(source)).css).toContain('width:32rpx')
    build = true
    expect(stage.options.cssCalc).toBe(false)
    original.cssOptions = { cssCalc: false, rem2rpx: true }
    expect(stage.shouldDefer()).toBe(false)
    expect(stage.options.rem2rpx).toBe(true)
    expect(stage.options.cssOptions?.rem2rpx).toBe(true)
    build = false
    original.cssOptions = undefined
    expect(stage.options.cssCalc).toEqual(['--spacing'])
  })

  it('原生 App 的嵌入式样式不等待 CSS 资产收尾', () => {
    const original = options()
    original.appType = 'uni-app-x'
    original.uniAppX = true
    original.platform = 'app-android'
    const stage = createViteCssCalcStage(original, () => true)
    expect(stage.shouldDefer()).toBe(false)
    expect(stage.options.cssCalc).toEqual(['--spacing'])
    expect(stage.options.rem2rpx).toBe(true)
    expect(stage.getFinalOptions()).toBeUndefined()
  })
})
