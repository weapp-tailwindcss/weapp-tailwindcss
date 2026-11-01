import { describe, expect, it, vi } from 'vitest'
import { transformTailwindV4GeneratedCss } from '../src/compat/tailwindcss-v4/generated-output'
import { transformGeneratorUserCss } from '../src/compat/tailwindcss-v4/user-css/transform'

describe('Web 生成的属性语义与单位阶段', () => {
  it.each([false, true])('单位兜底延后=%s 时先纠正 rpx 长度属性', async (deferWebRpxConversion) => {
    const css = await transformTailwindV4GeneratedCss('.text{color:32rpx}.border{border-color:8rpx}', 'web', { deferWebRpxConversion }, true)
    expect(css).toBe(deferWebRpxConversion
      ? '.text{font-size:32rpx}.border{border-width:8rpx}'
      : '.text{font-size:1rem}.border{border-width:0.25rem}')
  })

  it('显式单位规则消耗 rpx 前纠正属性，且规则只执行一次', async () => {
    const css = await transformTailwindV4GeneratedCss('.text{color:32rpx}.space{padding:2rem}', 'web', {
      deferWebRpxConversion: true,
      unitConversion: { rules: [{ from: 'rpx', to: 'rem', factor: 1 / 40 }, { from: 'rem', to: 'rem', factor: 2 }] },
    }, true)
    expect(css).toBe('.text{font-size:0.8rem}.space{padding:4rem}')
  })

  it('属性纠正后的重复生成规则保留最后的级联位置', async () => {
    const css = await transformTailwindV4GeneratedCss('.text{font-size:32rpx}.other{font-size:64rpx}.text{color:32rpx}', 'web', { deferWebRpxConversion: true }, true)
    expect(css).toBe('.other{font-size:64rpx}.text{font-size:32rpx}')
  })

  it.each([false, true])('原始作者 CSS 遵循相同的单位规则（延后=%s）', async (deferWebRpxConversion) => {
    const styleHandler = vi.fn()
    const css = await transformGeneratorUserCss('.vendor{padding:16px}', {
      generatorTarget: 'web',
      generatorStyleOptions: { px2rpx: true, webRpxCompatibility: true, deferWebRpxConversion },
      cssUserHandlerOptions: {},
      importFallback: true,
      styleHandler,
    })
    expect(css).toBe(deferWebRpxConversion ? '.vendor{padding:16rpx}' : '.vendor{padding:0.5rem}')
    expect(styleHandler).not.toHaveBeenCalled()
  })

  it('已处理作者 CSS 不重复执行非幂等单位规则', async () => {
    const css = await transformGeneratorUserCss('.vendor{padding:4rem}', {
      generatorTarget: 'web',
      generatorStyleOptions: { unitConversion: { rules: [{ from: 'rem', to: 'rem', factor: 2 }] } },
      cssUserHandlerOptions: {},
      importFallback: true,
      processed: true,
      styleHandler: vi.fn(),
    })
    expect(css).toBe('.vendor{padding:4rem}')
  })
})
