import type { OutputAsset } from 'rollup'
import type { CssFinalizerContext } from '@/bundlers/vite/css-finalizer/options'
import type { InternalUserDefinedOptions } from '@/types'
import { logger } from '@weapp-tailwindcss/logger'
import { createStyleHandler } from '@weapp-tailwindcss/postcss/transform'
import { afterEach, expect, it, vi } from 'vitest'
import { createViteCssCalcStage } from '@/bundlers/vite/css-calc-stage'
import { finalizeCssAssets } from '@/bundlers/vite/css-finalizer/final-assets'
import { recordRpxThemeRisk } from '@/tailwindcss/v4/rpx-theme-warning'

function asset(fileName: string, source: string): OutputAsset {
  return { type: 'asset', fileName, source, names: [], originalFileNames: [] }
}

function fixture(cssCalc?: InternalUserDefinedOptions['cssCalc']) {
  const original = {
    cssCalc, platform: 'mp-weixin', appType: 'uni-app', rem2rpx: false,
    tailwindRuntime: { majorVersion: 4 }, generator: { target: 'weapp' },
    cssMatcher: (file: string) => file.endsWith('.wxss'), htmlMatcher: () => false,
    onUpdate: vi.fn(), styleHandler: createStyleHandler(),
  } as unknown as InternalUserDefinedOptions
  const stage = createViteCssCalcStage(original, () => true)
  const runtimeState = { tailwindRuntime: original.tailwindRuntime, readyPromise: Promise.resolve() }
  recordRpxThemeRisk(runtimeState, 'theme', ['--spacing'])
  const context = {
    opts: stage.options, getFinalCssCalcOptions: stage.getFinalOptions,
    runtimeState, debug: vi.fn(), getResolvedConfig: () => undefined,
  } as unknown as CssFinalizerContext
  return { original, context }
}

afterEach(() => vi.restoreAllMocks())

it('先完成最终自动计算，静态主题默认不警告；后续覆盖触发一次提示', async () => {
  const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
  const { context } = fixture()
  const bundle = {
    'tokens.wxss': asset('tokens.wxss', 'page{--spacing:1rpx}.w{width:calc(var(--spacing)*32)}'),
    'component.wxss': asset('component.wxss', '.scope{color:red}'),
  }
  await finalizeCssAssets(bundle, context, false, new Set())
  expect(bundle['tokens.wxss'].source).toContain('width:32rpx')
  expect(warn).not.toHaveBeenCalled()
  // 缓存命中的安全轮次同样不占用额度。
  await finalizeCssAssets(bundle, context, false, new Set())
  expect(warn).not.toHaveBeenCalled()
  bundle['component.wxss'].source = '.scope{--spacing:3rpx}'
  await finalizeCssAssets(bundle, context, false, new Set())
  expect(bundle['tokens.wxss'].source).toContain('calc(var(--spacing)*32)')
  expect(warn).toHaveBeenCalledTimes(1)
  expect(warn.mock.lastCall?.[0]).toContain('最终样式仍含 rpx 运行时 calc：--spacing')
  bundle['component.wxss'].source = '.scope{color:red}'
  await finalizeCssAssets(bundle, context, false, new Set())
  expect(bundle['tokens.wxss'].source).toContain('width:32rpx')
  bundle['component.wxss'].source = '.scope{--spacing:2rpx}'
  await finalizeCssAssets(bundle, context, false, new Set())
  expect(warn).toHaveBeenCalledTimes(1)
})

it.each([true, ['--spacing'], false, { includeCustomProperties: ['--spacing'], preserve: true }] as const)('显式配置 %j 根据最终有效声明判断', async (cssCalc) => {
  const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
  const { context } = fixture(cssCalc as InternalUserDefinedOptions['cssCalc'])
  const bundle = { 'tokens.wxss': asset('tokens.wxss', 'page{--spacing:1rpx}.w{width:calc(var(--spacing)*32)}') }
  await finalizeCssAssets(bundle, context, false, new Set())
  expect(warn).toHaveBeenCalledTimes(cssCalc === false || (typeof cssCalc === 'object' && 'preserve' in cssCalc) ? 1 : 0)
})

it('内联主题自动归约后不警告，未知导入导致的变量 calc 保留时提示', async () => {
  const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
  const { context } = fixture()
  const bundle = { 'tokens.wxss': asset('tokens.wxss', '.w{width:calc(1rpx*32)}') }
  await finalizeCssAssets(bundle, context, false, new Set())
  expect(bundle['tokens.wxss'].source).toContain('32rpx')
  expect(warn).not.toHaveBeenCalled()
  bundle['tokens.wxss'].source = '@import "./external.wxss";page{--spacing:1rpx}.w{width:calc(var(--spacing)*32)}'
  await finalizeCssAssets(bundle, context, false, new Set())
  expect(warn).toHaveBeenCalledTimes(1)
})
