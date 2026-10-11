import type { NativeVisualProbe } from '../examples/react-native-expo/src/visual-probes'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { assessNativeScreenshot } from './react-native/native-screenshot'

function fixture() {
  const image = new PNG({ width: 120, height: 180 })
  image.data.fill(255)
  const probes: NativeVisualProbe[] = [
    { id: 'theme-card', bounds: { x: 10, y: 10, width: 40, height: 20 }, rgb: [43, 127, 255] },
    { id: 'tsx-hmr', bounds: { x: 10, y: 30, width: 40, height: 20 }, rgb: [255, 32, 86] },
    { id: 'css-hmr', bounds: { x: 10, y: 50, width: 40, height: 20 }, rgb: [245, 158, 11] },
  ]
  for (const { bounds, rgb } of probes) {
    for (let y = bounds.y * 2; y < (bounds.y + bounds.height) * 2; y++) {
      for (let x = bounds.x * 2; x < (bounds.x + bounds.width) * 2; x++) {
        image.data.set([...rgb, 255], (y * image.width + x) * 4)
      }
    }
  }
  return { image, probes }
}

describe('React Native screenshot readiness', () => {
  it('requires current background colors at measured device-pixel coordinates', () => {
    const { image, probes } = fixture()
    expect(assessNativeScreenshot(image, probes, 2).passed).toBe(true)
    expect(assessNativeScreenshot(image, probes, 1).passed).toBe(false)
  })

  it('rejects a native refresh overlay even when the updated HMR markers remain visible', () => {
    const { image, probes } = fixture()
    for (let y = 0; y < 60; y++) {
      for (let x = 0; x < image.width; x++) {
        image.data.set([37, 134, 230, 255], (y * image.width + x) * 4)
      }
    }
    expect(assessNativeScreenshot(image, probes, 2).passed).toBe(false)
  })

  it('rejects stale colors, missing probes and invalid or clipped geometry', () => {
    const { image, probes } = fixture()
    expect(assessNativeScreenshot(image, probes.map(p => p.id === 'css-hmr' ? { ...p, rgb: [16, 185, 129] } : p), 2).passed).toBe(false)
    expect(assessNativeScreenshot(image, [], 2).passed).toBe(false)
    expect(assessNativeScreenshot(image, [probes[0]!, probes[0]!, probes[2]!], 2).passed).toBe(false)
    expect(assessNativeScreenshot(image, probes.map(p => ({ ...p, bounds: { ...p.bounds, x: -1 } })), 2).passed).toBe(false)
    expect(assessNativeScreenshot(image, probes, Number.NaN).passed).toBe(false)
  })
})
