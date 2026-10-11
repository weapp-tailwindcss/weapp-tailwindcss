import { PNG } from 'pngjs'
import { expect, it } from 'vitest'
import { cropCssPixelRegion } from './issue-928/css-pixel-region'

function screenshot(scale: number) {
  const png = new PNG({ width: 12 * scale, height: 8 * scale })
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const index = (y * png.width + x) * 4
      png.data[index] = Math.floor(x / scale) * 20
      png.data[index + 1] = Math.floor(y / scale) * 30
      png.data[index + 2] = 90
      png.data[index + 3] = 255
    }
  }
  return png
}

it('相同 CSS 页面在不同截图密度下生成相同对照区域', () => {
  const rect = { left: 2, top: 1, width: 5, height: 4 }
  const expected = cropCssPixelRegion(screenshot(1), 12, rect)
  for (const scale of [1.5, 2, 3]) {
    const actual = cropCssPixelRegion(screenshot(scale), 12, rect)
    expect([actual.width, actual.height]).toEqual([5, 4])
    expect(actual.data).toEqual(expected.data)
  }
})

it('真实 CSS 尺寸变化不会被归一化为旧尺寸', () => {
  const actual = cropCssPixelRegion(screenshot(2), 12, { left: 2, top: 1, width: 6, height: 4 })
  expect([actual.width, actual.height]).toEqual([6, 4])
})

it.each([[640, 390], [804, 375]])('像素基线拒绝非整数截图采样比例 %s/%s', (width, viewportWidth) => {
  const source = new PNG({ width, height: 1428 })
  expect(() => cropCssPixelRegion(source, viewportWidth, { left: 22, top: 70, width: 240, height: 128 }, { requireIntegerScale: true }))
    .toThrow('100%')
})

it.each([1, 2, 3])('像素基线保留整数密度 %s 的真实采样', (scale) => {
  const source = screenshot(scale)
  const rect = { left: 2, top: 1, width: 5, height: 4 }
  expect(cropCssPixelRegion(source, 12, rect, { requireIntegerScale: true }).data)
    .toEqual(cropCssPixelRegion(source, 12, rect).data)
})

it.each([
  { left: 10, top: 1, width: 5, height: 4 },
  { left: 2, top: 6, width: 5, height: 4 },
  { left: -1, top: 1, width: 5, height: 4 },
])('不接受越界或缺失的页面区域：%j', (rect) => {
  expect(() => cropCssPixelRegion(screenshot(2), 12, rect)).toThrow()
})
