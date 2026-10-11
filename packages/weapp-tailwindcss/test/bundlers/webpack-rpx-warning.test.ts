import type { SetupWebpackV5ProcessAssetsHookOptions } from '@/bundlers/webpack/BaseUnifiedPlugin/v5-assets/helpers'
import { logger } from '@weapp-tailwindcss/logger'
import { afterEach, expect, it, vi } from 'vitest'
import { setupWebpackV5ProcessAssetsHook } from '@/bundlers/webpack/BaseUnifiedPlugin/v5-assets'
import { getCompilerContext } from '@/context'
import { recordRpxThemeRisk } from '@/tailwindcss/v4/rpx-theme-warning'

afterEach(() => vi.restoreAllMocks())

it.each(['mp-weixin', 'mp-alipay'])('Webpack 最终 asset 检查保留平台与会话边界：%s', async (platform) => {
  const options = getCompilerContext({ platform, cssCalc: false, cssPreflight: false })
  const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
  const runtimeState = { tailwindRuntime: options.tailwindRuntime, readyPromise: Promise.resolve() }
  recordRpxThemeRisk(runtimeState, 'theme', ['--spacing'])
  const callbacks = new Map<number, (assets: Record<string, { source: () => string }>) => Promise<void>>()
  let css = 'page{--spacing:1rpx}.p-8{padding:8rpx}'
  const asset = { source: () => css }
  const compilation = {
    hooks: {
      processAssets: {
        tapPromise: ({ stage }: { stage: number }, callback: (assets: Record<string, { source: () => string }>) => Promise<void>) => callbacks.set(stage, callback),
      },
    },
    getAsset: () => ({ source: asset }),
    updateAsset: (_file: string, source: { source: () => string }) => { css = source.source() },
  }
  const compiler = {
    webpack: {
      Compilation: { PROCESS_ASSETS_STAGE_SUMMARIZE: 1000, PROCESS_ASSETS_STAGE_OPTIMIZE_HASH: 2500 },
      sources: {
        ConcatSource: class {
          constructor(private value: string) {}
          source() { return this.value }
        },
      },
    },
    hooks: { compilation: { tap: (_name: string, callback: (value: typeof compilation) => void) => callback(compilation) } },
  }
  setupWebpackV5ProcessAssetsHook({
    compiler, options, runtimeState, debug: vi.fn(),
  } as unknown as SetupWebpackV5ProcessAssetsHookOptions)
  const finalize = callbacks.get(2500)!
  expect(finalize).toBeTypeOf('function')
  await finalize({ 'tokens.wxss': asset })
  expect(warn).not.toHaveBeenCalled()
  css = 'page{--spacing:1rpx}.p-8{padding:calc(var(--spacing)*8)}'
  await finalize({ 'tokens.wxss': asset })
  await finalize({ 'tokens.wxss': asset })
  expect(css).toContain('calc(var(--spacing)*8)')
  expect(warn).toHaveBeenCalledTimes(platform === 'mp-weixin' ? 1 : 0)
})
