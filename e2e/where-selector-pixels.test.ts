import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { sampleSelectorPixels } from './where-selector/pixels'

function paint(png: PNG, left: number, top: number, width: number, height: number, color: number[]) {
  for (let y = top; y < top + height; y++) {
    for (let x = left; x < left + width; x++) {
      png.data.set([...color, 255], (png.width * y + x) * 4)
    }
  }
}

describe('选择器背景和边框分区采样', () => {
  it.each([1, 2])('在像素比 %s 下保留顶边同时避开背景文字', (scale) => {
    const png = new PNG({ width: 375 * scale, height: 150 * scale })
    paint(png, 10 * scale, 10 * scale, 100 * scale, 44 * scale, [22, 163, 74])
    paint(png, 10 * scale, 10 * scale, 100 * scale, 4 * scale, [37, 99, 235])
    const sample = sampleSelectorPixels(png, { left: 10, top: 10, width: 100, height: 44 }, 375, 4)
    expect(sample.bluePixels).toBe(400 * scale * scale)
    expect(sample.greenPixels).toBeGreaterThan(200)
    expect(sample.borderRect.height).toBe(4 * scale)
    expect(sample.targetRect.top).toBeGreaterThanOrEqual(sample.borderRect.top + sample.borderRect.height)
  })

  it('框外和内部蓝色不能代替缺失的顶边', () => {
    const png = new PNG({ width: 375, height: 150 })
    paint(png, 0, 0, 375, 150, [37, 99, 235])
    paint(png, 10, 10, 100, 44, [22, 163, 74])
    paint(png, 20, 20, 80, 20, [37, 99, 235])
    const sample = sampleSelectorPixels(png, { left: 10, top: 10, width: 100, height: 44 }, 375, 4)
    expect(sample.bluePixels).toBe(0)
  })
})
