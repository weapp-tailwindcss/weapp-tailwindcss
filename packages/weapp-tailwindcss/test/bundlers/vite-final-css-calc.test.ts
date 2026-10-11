import type { OutputAsset, OutputBundle } from 'rollup'
import type { CssFinalizerContext } from '@/bundlers/vite/css-finalizer/options'
import type { InternalUserDefinedOptions } from '@/types'
import { createStyleHandler } from '@weapp-tailwindcss/postcss/transform'
import { describe, expect, it, vi } from 'vitest'
import { createViteCssCalcStage } from '@/bundlers/vite/css-calc-stage'
import { finalizeCssCalc } from '@/bundlers/vite/css-finalizer/css-calc'

function asset(fileName: string, source: string): OutputAsset {
  return { type: 'asset', fileName, source, names: [], originalFileNames: [] }
}

function context(options: Record<string, unknown> = {}) {
  const original = {
    cssCalc: ['--spacing'],
    rem2rpx: false,
    cssPreflight: false,
    tailwindRuntime: { majorVersion: 4 },
    generator: { target: 'weapp' },
    cssMatcher: (file: string) => file.endsWith('.acss'),
    htmlMatcher: () => false,
    onUpdate: vi.fn(),
    ...options,
  } as unknown as InternalUserDefinedOptions
  original.styleHandler = createStyleHandler(original)
  const stage = createViteCssCalcStage(original, () => true)
  return {
    opts: stage.options,
    getFinalCssCalcOptions: stage.getFinalOptions,
    recordCssAssetResult: vi.fn(),
  } as unknown as CssFinalizerContext
}

const utility = 'page{--spacing:1rpx}.w-32{width:calc(var(--spacing)*32)}'

describe('Vite 最终 CSS 作用域静态化', () => {
  it('独立作者样式通过同一导入根阻止错误冻结', async () => {
    const bundle = {
      'entry.acss': asset('entry.acss', '@import "./utilities.acss";@import "./author.acss";'),
      'utilities.acss': asset('utilities.acss', utility),
      'author.acss': asset('author.acss', '.scope{--spacing:2rpx}'),
      'isolated.acss': asset('isolated.acss', utility),
    }
    await finalizeCssCalc(bundle, context(), true)
    expect(bundle['utilities.acss'].source).toContain('width:calc(var(--spacing)*32)')
    expect(bundle['isolated.acss'].source).toContain('width:32rpx')
  })

  it('共享工具类受所有消费作用域约束，独立入口自己的声明不被污染', async () => {
    const bundle = {
      'first.acss': asset('first.acss', `@import "./shared.acss";${utility}`),
      'second.acss': asset('second.acss', '@import "./shared.acss";.scope{--spacing:2rpx}'),
      'shared.acss': asset('shared.acss', utility),
    }
    await finalizeCssCalc(bundle, context(), true)
    expect(bundle['shared.acss'].source).toContain('width:calc(var(--spacing)*32)')
    expect(bundle['first.acss'].source).toContain('width:32rpx')
  })

  it('watch 新增和删除外部覆盖时，从缓存中的原始表达式重新计算', async () => {
    const ctx = context()
    const bundle = {
      'entry.acss': asset('entry.acss', '@import "./utilities.acss";@import "./author.acss";'),
      'utilities.acss': asset('utilities.acss', utility),
      'author.acss': asset('author.acss', '.scope{color:red}'),
    }
    await finalizeCssCalc(bundle, ctx, true)
    expect(bundle['utilities.acss'].source).toContain('width:32rpx')
    bundle['author.acss'].source = '.scope{--spacing:2rpx}'
    await finalizeCssCalc(bundle, ctx, true)
    expect(bundle['utilities.acss'].source).toContain('width:calc(var(--spacing)*32)')
    bundle['author.acss'].source = '.scope{color:red}'
    await finalizeCssCalc(bundle, ctx, true)
    expect(bundle['utilities.acss'].source).toContain('width:32rpx')
    expect(ctx.recordCssAssetResult).not.toHaveBeenCalled()
  })

  it('watch 删除导入边后恢复静态化，不受仍在 bundle 中的独立资产污染', async () => {
    const ctx = context()
    const bundle = {
      'entry.acss': asset('entry.acss', '@import "./utilities.acss";@import "./author.acss";'),
      'utilities.acss': asset('utilities.acss', utility),
      'author.acss': asset('author.acss', '.scope{--spacing:2rpx}'),
    }
    await finalizeCssCalc(bundle, ctx, true)
    bundle['entry.acss'].source = '@import "./utilities.acss";'
    await finalizeCssCalc(bundle, ctx, true)
    expect(bundle['utilities.acss'].source).toContain('width:32rpx')
  })

  it('新资产即使恰好等于上一轮静态结果，也不恢复旧表达式', async () => {
    const ctx = context()
    const entrySource = '@import "./utilities.acss";@import "./author.acss";'
    const bundle = {
      'entry.acss': asset('entry.acss', entrySource),
      'utilities.acss': asset('utilities.acss', utility),
      'author.acss': asset('author.acss', '.scope{color:red}'),
    }
    await finalizeCssCalc(bundle, ctx, true)
    const literal = String(bundle['utilities.acss'].source)
    const nextBundle = {
      'entry.acss': asset('entry.acss', entrySource),
      'utilities.acss': asset('utilities.acss', literal),
      'author.acss': asset('author.acss', '.scope{--spacing:2rpx}'),
    }
    await finalizeCssCalc(nextBundle, ctx, true)
    expect(nextBundle['utilities.acss'].source).toBe(literal)
    expect(nextBundle['utilities.acss'].source).toContain('width:32rpx')
  })

  it('跨资产计算后才按配置转换单位和舍入', async () => {
    const ctx = context({ rem2rpx: { rootValue: 32, unitPrecision: 2, propList: ['*'], transformUnit: 'rpx' } })
    const bundle = {
      'entry.acss': asset('entry.acss', '@import "./theme.acss";.w{width:calc(var(--spacing)*10)}'),
      'theme.acss': asset('theme.acss', 'page{--spacing:.0001rem}'),
    }
    await finalizeCssCalc(bundle, ctx, true)
    expect(bundle['entry.acss'].source).toContain('width:0.03rpx')
    expect(bundle['theme.acss'].source).not.toContain('rem')
    await finalizeCssCalc(bundle, ctx, true)
    expect(bundle['entry.acss'].source).toContain('width:0.03rpx')
  })

  it('自定义主题作用域无法证明安全时保留表达式', async () => {
    const bundle = { 'entry.acss': asset('entry.acss', '.custom-root{--spacing:1rpx}.w{width:calc(var(--spacing)*32)}') }
    await finalizeCssCalc(bundle, context(), true)
    expect(bundle['entry.acss'].source).toContain('width:calc(var(--spacing)*32)')
  })

  it('条件导入提供的主题不能当作无条件常量', async () => {
    const bundle = {
      'entry.acss': asset('entry.acss', '@import "./theme.acss" screen;.w{width:calc(var(--spacing)*32)}'),
      'theme.acss': asset('theme.acss', 'page{--spacing:1rpx}'),
    }
    await finalizeCssCalc(bundle, context(), true)
    expect(bundle['entry.acss'].source).toContain('width:calc(var(--spacing)*32)')
  })

  it('显式关闭配置保持最终表达式', async () => {
    const bundle: OutputBundle = { 'entry.acss': asset('entry.acss', utility) }
    await finalizeCssCalc(bundle, context({ cssOptions: { cssCalc: false } }), true)
    expect((bundle['entry.acss'] as OutputAsset).source).toBe(utility)
  })
})
