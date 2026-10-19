import type { Page } from 'playwright'
import type { WebPixelMeasurement } from '../web/pixels'
import type { CaptureLifecycleScreenshot, LifecycleValues } from './types'
import { readPixels, rgbaChannels } from '../web/pixels'

export interface LifecyclePixelPoint { id: string, selector: string, x: number, y: number }

export async function captureLifecyclePixels(page: Page, capture: CaptureLifecycleScreenshot, stage: string, points: readonly LifecyclePixelPoint[]) {
  const geometry = await page.evaluate(points => points.map(point => ({ ...point, rect: document.querySelector(point.selector)!.getBoundingClientRect().toJSON() })), points)
  const bytes = await capture(stage)
  const pixels: WebPixelMeasurement[] = geometry.flatMap(point => readPixels(bytes, point.rect, [{ id: point.id, x: point.x, y: point.y, expected: [0, 0, 0, 0], tolerance: 0 }]))
  const entries = pixels.flatMap(pixel => rgbaChannels.map((channel, index) => [`${stage}/pixel/${pixel.id}/${channel}`, pixel.rgba[index]!]))
  const values: LifecycleValues = Object.fromEntries(entries)
  return { pixels, values, geometry }
}
