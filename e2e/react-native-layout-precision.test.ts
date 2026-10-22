import { describe, expect, it } from 'vitest'
import { nativeLayoutSizeMatches } from './react-native/layout-precision'

describe('受控原生布局的 binary32 表示边界', () => {
  it.each([2.75, 3])('接受真实内容尺寸的表示误差，密度 %s', (density) => {
    for (const actual of [144 + 2 ** -16, 144, 144 - 2 ** -15]) {
      expect(nativeLayoutSizeMatches(actual, 144, 874, density)).toBe(true)
    }
  })

  it.each([144 + 5 * 2 ** -16, 144 - 5 * 2 ** -16, 144.001, 143.999])('拒绝越过 viewport 端点表示界的 %s', (actual) => {
    expect(nativeLayoutSizeMatches(actual, 144, 874, 3)).toBe(false)
  })

  it('小 viewport 不借用大 viewport 的表示界', () => {
    expect(nativeLayoutSizeMatches(144 + 2 ** -15, 144, 108, 3)).toBe(false)
    expect(nativeLayoutSizeMatches(144 + 2 ** -15, 144, 874, 3)).toBe(true)
  })

  it('端点包络跨 1024 幂边界时按 binary32 间距变化，下一步仍拒绝', () => {
    expect(nativeLayoutSizeMatches(144 + 8 * 2 ** -16, 144, 879, 3)).toBe(false)
    expect(nativeLayoutSizeMatches(144 + 8 * 2 ** -16, 144, 880, 3)).toBe(true)
    expect(nativeLayoutSizeMatches(144 + 9 * 2 ** -16, 144, 880, 3)).toBe(false)
  })

  it.each([1 / 3, -1 / 3])('即使大 viewport 的表示界覆盖差值，也不能丢失一个物理像素 %s', (delta) => {
    expect(nativeLayoutSizeMatches(144 + delta, 144, 2 ** 24, 3)).toBe(false)
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -1])('拒绝非有限或非正输入 %s', (value) => {
    expect(nativeLayoutSizeMatches(value, 144, 874, 3)).toBe(false)
    expect(nativeLayoutSizeMatches(144, value, 874, 3)).toBe(false)
    expect(nativeLayoutSizeMatches(144, 144, value, 3)).toBe(false)
    expect(nativeLayoutSizeMatches(144, 144, 874, value)).toBe(false)
  })

  it('拒绝不能表示为原生有限端点或安全物理像素的来源', () => {
    expect(nativeLayoutSizeMatches(144, 144, 2 ** 128, 3)).toBe(false)
    expect(nativeLayoutSizeMatches(144, 144, 874, Number.MAX_VALUE)).toBe(false)
    expect(nativeLayoutSizeMatches(144, 144, 874, Number.MIN_VALUE)).toBe(false)
  })
})
