import { PNG } from 'pngjs'
import { expect, it } from 'vitest'
import { assertionPassed } from './tailwind-capabilities/report'
import { sampleWeappPixel, weappPixelAssertions, weappPixelContract } from './tailwind-capabilities/weapp/pixels'

it('ICC 转换的单级量化误差要求独立参考同样匹配，错误颜色或透明度不能通过', () => {
  const expected = [18, 52, 86, 255]
  expect(weappPixelAssertions([18, 52, 85, 255], [18, 52, 85, 255], expected).every(assertionPassed)).toBe(true)
  expect(weappPixelAssertions([18, 52, 84, 255], [18, 52, 84, 255], expected).every(assertionPassed)).toBe(false)
  expect(weappPixelAssertions([18, 52, 85, 255], expected, expected).every(assertionPassed)).toBe(false)
  expect(weappPixelAssertions([18, 52, 86, 254], [18, 52, 86, 254], expected).every(assertionPassed)).toBe(false)
  const contract = weappPixelContract(expected)
  expect(contract.requiredAssertions).toHaveLength(12)
  expect(contract.tolerances).toMatchObject({ 'pixel-2': 1, 'reference-pixel-2': 1 })
  expect(contract.tolerances).not.toHaveProperty('pixel-3')
})

it('按实际截图比例采样，并拒绝空白、裁剪或错误颜色', () => {
  const png = new PNG({ width: 200, height: 120 })
  const rect = { left: 5, top: 5, width: 20, height: 20 }
  const x = Math.floor((5 + 20 * 0.85) * 2)
  const y = x
  png.data.set([18, 52, 86, 255], (y * png.width + x) * 4)
  expect(sampleWeappPixel(png, 100, rect)).toEqual([18, 52, 86, 255])
  expect(sampleWeappPixel(png, 200, rect)).not.toEqual([18, 52, 86, 255])
  expect(() => sampleWeappPixel(png, 100, { ...rect, top: 100 })).toThrow('超出')
  expect(() => sampleWeappPixel(png, 0, rect)).toThrow('超出')
})
