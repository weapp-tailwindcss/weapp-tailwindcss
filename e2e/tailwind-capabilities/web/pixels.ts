import type { Buffer } from 'node:buffer'
import type { SemanticAssertion } from '../types'
import { PNG } from 'pngjs'

export const rgbaChannels = ['red', 'green', 'blue', 'alpha'] as const

export interface WebPixelSample {
  id: string
  x: number
  y: number
  expected: [number, number, number, number]
  tolerance: number
}

export interface WebPixelMeasurement {
  id: string
  x: number
  y: number
  rgba: [number, number, number, number]
}

export function pixelAssertionName(sample: WebPixelSample, channel: typeof rgbaChannels[number]) {
  return `pixel/${sample.id}/${channel}`
}

export function readPixels(bytes: Buffer, rect: { left: number, top: number, width: number, height: number }, samples: readonly WebPixelSample[], scroll = { x: 0, y: 0 }): WebPixelMeasurement[] {
  const png = PNG.sync.read(bytes)
  return samples.map((sample) => {
    const x = Math.floor(rect.left + scroll.x + rect.width * sample.x)
    const y = Math.floor(rect.top + scroll.y + rect.height * sample.y)
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= png.width || y >= png.height) {
      throw new Error(`像素采样超出本轮截图：${sample.id}/${x},${y}/${png.width},${png.height}`)
    }
    const offset = (y * png.width + x) * 4
    return { id: sample.id, x, y, rgba: [png.data[offset]!, png.data[offset + 1]!, png.data[offset + 2]!, png.data[offset + 3]!] }
  })
}

export function pixelAssertions(samples: readonly WebPixelSample[], measurements: readonly WebPixelMeasurement[]): SemanticAssertion[] {
  return samples.flatMap((sample) => {
    const measurement = measurements.find(item => item.id === sample.id)
    if (!measurement) {
      throw new Error(`缺少本轮像素采样：${sample.id}`)
    }
    return rgbaChannels.map((channel, index) => ({ name: pixelAssertionName(sample, channel), stage: 'visual', actual: measurement.rgba[index]!, expected: sample.expected[index]!, tolerance: sample.tolerance }))
  })
}
