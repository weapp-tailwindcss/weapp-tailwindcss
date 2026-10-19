import { PNG } from 'pngjs'
import { expect, it } from 'vitest'
import { sampleWeappPixel } from './tailwind-capabilities/weapp/pixels'

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
