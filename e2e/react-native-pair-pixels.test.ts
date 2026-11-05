import type { NativePairEvidence } from '../examples/react-native-expo/src/compatibility/protocol'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { syntheticRuntimeInstallation } from './react-native/installation-fixture'
import { assessNativePair } from './react-native/pair-assessment'

const background = [226, 232, 240]

function fixture() {
  const image = new PNG({ width: 128, height: 128 })
  for (let offset = 0; offset < image.data.length; offset += 4) {
    image.data.set([...background, 255], offset)
  }
  const pair: NativePairEvidence = {
    runtimeInstallation: syntheticRuntimeInstallation(),
    runId: 'pixel-run',
    revision: 'revision',
    platform: 'web',
    id: 'background-color',
    phase: 'default',
    probe: { x: 1.25, y: 2.25, width: 20, height: 20 },
    reference: { x: 25.25, y: 2.25, width: 20, height: 20 },
    control: { x: 1.25, y: 30.25, width: 20, height: 20 },
    target: { x: 3.25, y: 4.25, width: 16, height: 16 },
    referenceTarget: { x: 27.25, y: 4.25, width: 16, height: 16 },
    controlTarget: { x: 3.25, y: 32.25, width: 16, height: 16 },
    viewport: { width: 64, height: 64, pixelRatio: 2 },
  }
  const paint = (side: 'probe' | 'reference' | 'control', color: number[], indexes = Array.from({ length: 1600 }, (_, index) => index)) => {
    const rect = pair[side]
    for (const index of indexes) {
      const x = Math.round(rect.x * 2) + index % 40
      const y = Math.round(rect.y * 2) + Math.floor(index / 40)
      image.data.set([...color, 255], (y * image.width + x) * 4)
    }
  }
  const assess = () => {
    const result = assessNativePair(image, pair)
    return { pixel: result[1]!, control: result[2]!, metrics: JSON.parse(result[1]!.actual), controlMetrics: JSON.parse(result[2]!.actual) }
  }
  return { image, pair, paint, assess }
}

describe('同屏像素遍历与原判定阈值', () => {
  it.each([0, 1, 2])('RGB 通道 %i 的前景边界仍为严格大于 10', (channel) => {
    const context = fixture()
    for (const delta of [10, 11]) {
      const color = background.map((value, index) => value - (index === channel ? delta : 0))
      context.paint('probe', color)
      context.paint('reference', color)
      const observed = context.assess()
      expect(observed.metrics).toEqual(delta === 10
        ? { active: 0, mismatchRatio: 1, meanDifference: 255 }
        : { active: 1600, mismatchRatio: 0, meanDifference: 0 })
      expect(observed.pixel.passed).toBe(delta === 11)
    }
  })

  it.each([0, 1, 2])('RGB 通道 %i 的 control 边界仍为严格大于 2', (channel) => {
    const context = fixture()
    context.paint('probe', [100, 120, 130])
    context.paint('reference', [100, 120, 130])
    for (const delta of [2, 3]) {
      context.paint('control', [100, 120, 130].map((value, index) => value + (index === channel ? delta : 0)))
      const observed = context.assess()
      expect(observed.controlMetrics.controlPixels).toBe(delta === 2 ? 0 : 1600)
      expect(observed.control.passed).toBe(delta === 3)
    }
  })

  it.each([0, 1, 2])('RGB 通道 %i 的不匹配边界仍为严格大于 24', (channel) => {
    const context = fixture()
    context.paint('reference', [100, 120, 130])
    for (const delta of [24, 25]) {
      context.paint('probe', [100, 120, 130].map((value, index) => value + (index === channel ? delta : 0)))
      expect(context.assess().metrics).toMatchObject({ active: 1600, mismatchRatio: delta === 24 ? 0 : 1 })
      expect(context.assess().metrics.meanDifference).toBeCloseTo(delta / 3, 10)
    }
  })

  it.each([15, 16])('包含最后一行和最后一列的 %i 个前景像素不能被采样跳过', (count) => {
    const context = fixture()
    const indexes = Array.from({ length: count }, (_, index) => 1599 - index)
    context.paint('probe', [100, 120, 130], indexes)
    context.paint('reference', [100, 120, 130], indexes)
    const observed = context.assess()
    expect(observed.metrics).toEqual({ active: count, mismatchRatio: 0, meanDifference: 0 })
    expect(observed.controlMetrics.controlPixels).toBe(count)
    expect(observed.pixel.passed).toBe(count === 16)
  })

  it.each([80, 81])('%i 个不同像素仍按全部 1600 个前景像素核对原 5% 门槛', (count) => {
    const context = fixture()
    context.paint('probe', [100, 120, 130])
    context.paint('reference', [100, 120, 130])
    context.paint('probe', [125, 120, 130], Array.from({ length: count }, (_, index) => 1599 - index))
    const observed = context.assess()
    expect(observed.metrics).toMatchObject({ active: 1600, mismatchRatio: count / 1600 })
    expect(observed.metrics.meanDifference).toBeCloseTo(count * 25 / 3 / 1600, 10)
    expect(observed.pixel.passed).toBe(count === 80)
  })
})
