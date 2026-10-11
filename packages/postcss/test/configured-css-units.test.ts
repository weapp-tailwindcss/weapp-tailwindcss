import { describe, expect, it } from 'vitest'
import { applyConfiguredCssCalc, applyConfiguredCssUnits } from '@/transform'

describe('延后执行的单位转换', () => {
  it('先计算再舍入，同时保留选择器和运行时声明', async () => {
    const source = ':root{--spacing:.0001rem}.raw:hover{width:calc(var(--spacing)*10)}'
    const calculated = await applyConfiguredCssCalc(source, { cssCalc: ['--spacing'] })
    const css = await applyConfiguredCssUnits(calculated, {
      rem2rpx: { rootValue: 32, unitPrecision: 2, propList: ['*'], transformUnit: 'rpx' },
    })
    expect(css).toContain(':root')
    expect(css).toContain('.raw:hover')
    expect(css).toContain('width:0.03rpx')
    expect(css).toContain('--spacing:')
  })

  it('解析嵌套配置和 unitConversion 平台别名', async () => {
    const css = await applyConfiguredCssUnits('.raw{width:10px}', {
      px2rpx: true,
      cssOptions: {
        px2rpx: false,
        platform: 'weapp',
        unitConversion: {
          default: false,
          platforms: { 'mp-weixin': { rules: [{ from: 'px', to: 'rpx', factor: 2 }] } },
        },
      },
    })
    expect(css).toBe('.raw{width:20rpx}')
  })

  it('按原管线顺序连接 unitsToPx 和 px2rpx，并支持关闭', async () => {
    const source = '.raw{width:2rem}'
    expect(await applyConfiguredCssUnits(source, {
      unitsToPx: { unitMap: { rem: 10 } },
      px2rpx: { designWidth: 375 },
    })).toContain('width:40rpx')
    expect(await applyConfiguredCssUnits(source, {
      rem2rpx: true,
      cssOptions: { rem2rpx: false },
    })).toBe(source)
    expect(await applyConfiguredCssUnits(source, {
      rem2rpx: true,
      cssOptions: { rem2rpx: undefined },
    })).toBe('.raw{width:64rpx}')
  })
})
