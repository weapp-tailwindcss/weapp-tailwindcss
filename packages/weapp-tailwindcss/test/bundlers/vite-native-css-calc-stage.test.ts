import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'
import type { InternalUserDefinedOptions } from '@/types'
import path from 'node:path'
import { createStyleHandler, postcss } from '@weapp-tailwindcss/postcss/transform'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createViteCssCalcStage } from '@/bundlers/vite/css-calc-stage'
import { resolveFrameworkStylePlatform } from '@/bundlers/vite/shared/framework-runtime-configuration'

function options(platform?: string) {
  const style: Partial<IStyleHandlerOptions> = {
    cssCalc: ['--spacing'],
    rem2rpx: { rootValue: 10, propList: ['*'], transformUnit: 'rpx' },
    cssPreflight: false,
  }
  return {
    ...style,
    platform,
    appType: 'uni-app-vite',
    uniAppX: false,
    cssOptions: { cssCalc: style.cssCalc, rem2rpx: style.rem2rpx },
    styleHandler: createStyleHandler(style),
    tailwindRuntime: { majorVersion: 4 },
    generator: { target: 'web' },
  } as InternalUserDefinedOptions
}

const source = ':root{--spacing:1rem}.w{width:calc(var(--spacing)*32)}'

describe('普通 uni-app 原生目标的嵌入式 CSS 阶段', () => {
  beforeEach(() => {
    for (const key of ['UNI_PLATFORM', 'UNI_UTS_PLATFORM', 'TARO_ENV', 'MPX_CURRENT_TARGET_MODE', 'MPX_CLI_MODE']) {
      vi.stubEnv(key, undefined)
    }
  })
  afterEach(() => vi.unstubAllEnvs())

  it.each(['app', 'app-plus', 'app-android', 'app-ios', 'app-harmony'])(
    '显式 %s 平台保留即时 calc 和单位转换，不修改用户配置',
    async (platform) => {
      const original = options(platform)
      const originalCssOptions = original.cssOptions
      const originalStyleHandler = original.styleHandler
      const stage = createViteCssCalcStage(original, () => true)
      expect(stage.shouldDefer()).toBe(false)
      expect(stage.getFinalOptions()).toBeUndefined()
      expect((await stage.options.styleHandler(source)).css).toContain('width:320rpx')
      expect((await stage.options.styleHandler.transformRoot(postcss.parse(source))).css).toContain('width:320rpx')
      expect(original.cssCalc).toEqual(['--spacing'])
      expect(original.rem2rpx).toEqual({ rootValue: 10, propList: ['*'], transformUnit: 'rpx' })
      expect(original.cssOptions).toBe(originalCssOptions)
      expect(original.styleHandler).toBe(originalStyleHandler)
      expect(original.uniAppX).toBe(false)
    },
  )

  it.each(['app', 'app-plus', 'app-android', 'app-ios', 'app-harmony'])(
    '输出目录推断 %s 平台时同样即时处理',
    async (platform) => {
      const original = options()
      const stage = createViteCssCalcStage(original, () => true, () => resolveFrameworkStylePlatform(original, path.join('dist', 'build', platform)))
      expect(stage.shouldDefer()).toBe(false)
      expect((await stage.options.styleHandler(source)).css).toContain('width:320rpx')
      expect(original.platform).toBeUndefined()
    },
  )

  it('优先使用 cssOptions 的显式平台，其次使用框架环境推断', async () => {
    const original = options('h5')
    original.cssOptions = { ...original.cssOptions, platform: ' APP-PLUS ' }
    const stage = createViteCssCalcStage(original, () => true, () => resolveFrameworkStylePlatform(original, 'mp-weixin'))
    expect(stage.shouldDefer()).toBe(false)
    expect((await stage.options.styleHandler(source)).css).toContain('width:320rpx')
    original.platform = undefined
    original.cssOptions.platform = undefined
    vi.stubEnv('UNI_PLATFORM', 'app-plus')
    expect(stage.shouldDefer()).toBe(false)
    expect((await stage.options.styleHandler(source)).css).toContain('width:320rpx')
  })

  it.each(['h5', 'web', 'mp-weixin', 'mp-alipay'])(
    'Web 和小程序 %s 继续使用最终 CSS 资产阶段',
    async (platform) => {
      const original = options(platform)
      const stage = createViteCssCalcStage(original, () => true)
      expect(stage.shouldDefer()).toBe(true)
      expect((await stage.options.styleHandler(source)).css).toContain('calc(var(--spacing)*32)')
      expect(stage.getFinalOptions()?.cssCalc).toEqual(['--spacing'])
    },
  )

  it('原生小程序 appType 不等同于原生 App 平台', () => {
    const original = options('mp-weixin')
    original.appType = 'native'
    original.generator = { target: 'weapp' }
    const stage = createViteCssCalcStage(original, () => true)
    expect(stage.shouldDefer()).toBe(true)
  })
})
