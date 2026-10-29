import type { Input } from 'postcss'
import type { IStyleHandlerOptions, Px2rpxOptions } from '@/types'
import postcss from 'postcss'
import { describe, expect, it, vi } from 'vitest'
import { createStyleHandler } from '@/handler'
import { applyConfiguredCssUnits } from '@/plugins/applyConfiguredCssUnits'
import { getPxTransformPlugin } from '@/plugins/getPxTransformPlugin'

describe('Issue 1318：px2rpx 的变量 fallback', () => {
  it.each([
    [true, '48rpx'],
    [{ designWidth: 375 }, '96rpx'],
  ] as const)('按设计稿倍率转换 fallback，保留变量名：%j', async (px2rpx, expected) => {
    const source = '.nut{height:var(--nutui-48px,48px);width:48px}'
    expect(await applyConfiguredCssUnits(source, { px2rpx }))
      .toBe(`.nut{height:var(--nutui-48px,${expected});width:${expected}}`)
  })

  it('普通管线与延迟管线保留同样的嵌套运行时引用', async () => {
    const source = '.nut{height:var(--height,calc(24px + var(--other,12px)))}'
    const options = { px2rpx: { designWidth: 375 } }
    const expected = '.nut{height:var(--height,calc(48rpx + var(--other,24rpx)))}'
    expect(await applyConfiguredCssUnits(source, options)).toBe(expected)
    const handler = createStyleHandler({
      cssPreflight: false,
      cssCalc: false,
      cssPresetEnv: { features: { 'custom-properties': false } },
      cssOptions: options,
    })
    expect((await handler(source)).css).toBe(expected)
  })

  it('保留字符串、URL、注释、标识符和变量首参数', async () => {
    const source = String.raw`.nut{height:var(--48px,48px);content:var(--text,"48px");background:var(--image,url("48px.png"));--author:var(--value,token48px /* 48px */)}`
    expect(await applyConfiguredCssUnits(source, { px2rpx: true }))
      .toBe(source.replace('var(--48px,48px)', 'var(--48px,48rpx)'))
  })

  it('支持负数、小数、科学计数及转义函数名', async () => {
    const source = String.raw`.nut{margin:var(--margin,-.5px);width:var(--width,1e2px);height:v\61r(--height,+2.5px);padding:var(--padding,-0px)}`
    expect(await applyConfiguredCssUnits(source, { px2rpx: { designWidth: 375 } }))
      .toBe(String.raw`.nut{margin:var(--margin,-1rpx);width:var(--width,200rpx);height:v\61r(--height,+5rpx);padding:var(--padding,0rpx)}`)
  })

  it('显式关闭 fallback 转换或整个 px2rpx 时保持原有配置语义', async () => {
    const source = '.nut{height:var(--height,48px);width:48px}'
    const legacyOptions: Px2rpxOptions = { transformVarFallbacks: false }
    expect(await applyConfiguredCssUnits(source, { px2rpx: false })).toBe(source)
    expect(await applyConfiguredCssUnits(source, {
      px2rpx: legacyOptions,
    })).toBe('.nut{height:var(--height,48px);width:48rpx}')
    expect(await applyConfiguredCssUnits(source, {
      px2rpx: true,
      cssOptions: { px2rpx: false },
    })).toBe(source)
  })

  it('按绝对值应用阈值和 1px 退出规则，保留大小写单位', async () => {
    const source = '.nut{margin:var(--margin,-1px);padding:var(--padding,-2px);height:var(--height,.5px);width:var(--width,3PX)}'
    expect(await applyConfiguredCssUnits(source, {
      px2rpx: { designWidth: 375, minPixelValue: 1, onePxTransform: false },
    })).toBe('.nut{margin:var(--margin,-1px);padding:var(--padding,-4rpx);height:var(--height,.5px);width:var(--width,3PX)}')
  })

  it('自定义 rootValue 仍收到无符号原始数值，结果保留负号', async () => {
    const rootValue = vi.fn((_input: Input, _match: string, _value: string) => 2)
    expect(await applyConfiguredCssUnits('.nut{margin:var(--margin,-2.5px)}', {
      px2rpx: { rootValue },
    })).toBe('.nut{margin:var(--margin,-1.25rpx)}')
    expect(rootValue).toHaveBeenCalledTimes(1)
    expect(rootValue.mock.calls[0]?.slice(1)).toEqual(['2.5px', '2.5'])
  })

  it('fallback 转换遵循属性、选择器和文件排除配置', async () => {
    const source = '.nut{width:var(--width,8px);height:var(--height,8px)}'
    expect(await applyConfiguredCssUnits(source, { px2rpx: { propList: ['width'] } }))
      .toBe('.nut{width:var(--width,8rpx);height:var(--height,8px)}')
    expect(await applyConfiguredCssUnits(source, { px2rpx: { selectorBlackList: ['.nut'] } })).toBe(source)
    expect(await applyConfiguredCssUnits(source, {
      px2rpx: { exclude: ['excluded.css'] },
      postcssOptions: { options: { from: 'excluded.css' } },
    })).toBe(source)
  })

  it('仅在 mediaQuery 开启时转换媒体条件中的 fallback', async () => {
    const source = '@media (min-width:var(--width,48px)){.nut{height:var(--height,8px)}}'
    expect(await applyConfiguredCssUnits(source, { px2rpx: true }))
      .toBe('@media (min-width:var(--width,48px)){.nut{height:var(--height,8rpx)}}')
    expect(await applyConfiguredCssUnits(source, { px2rpx: { mediaQuery: true } }))
      .toBe('@media (min-width:var(--width,48rpx)){.nut{height:var(--height,8rpx)}}')
  })

  it('replace:false 只插入一次转换结果，并保留 important 与原声明', async () => {
    const plugin = getPxTransformPlugin({
      px2rpx: { designWidth: 375, replace: false },
    } as IStyleHandlerOptions)!
    const processor = postcss([plugin])
    for (const size of [8, 12]) {
      const result = await processor.process(`.nut{width:var(--width,${size}px)!important}`, { from: undefined })
      const declarations: string[] = []
      result.root.walkDecls((decl) => {
        expect(decl.important).toBe(true)
        declarations.push(decl.value)
      })
      expect(declarations).toEqual([`var(--width,${size}px)`, `var(--width,${size * 2}rpx)`])
    }
  })

  it('复用 handler 时，调用配置改变不会命中另一种 fallback 策略的缓存', async () => {
    const source = '.nut{height:var(--height,48px)}'
    const handler = createStyleHandler({ cssPreflight: false, cssPresetEnv: { features: { 'custom-properties': false } }, px2rpx: true })
    const override = { cssOptions: { px2rpx: { transformVarFallbacks: false } } }
    expect((await handler(source, override)).css).toBe(source)
    override.cssOptions.px2rpx.transformVarFallbacks = true
    expect((await handler(source, override)).css).toBe('.nut{height:var(--height,48rpx)}')
    override.cssOptions.px2rpx.transformVarFallbacks = false
    expect((await handler(source, override)).css).toBe(source)
  })
})
