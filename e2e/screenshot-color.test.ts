import { Buffer } from 'node:buffer'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { expect, it } from 'vitest'
import { normalizeScreenshotToSrgb } from '../scripts/demo-visual-e2e-report/screenshot-color'
import { resolveChromeExecutable } from './hbuilderx-local/process'

it('converts an ICC-tagged wide-gamut screenshot to CSS sRGB before pixel assertions', async () => {
  const executablePath = await resolveChromeExecutable()
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
  let image: Buffer
  try {
    const page = await browser.newPage()
    const source = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 4
      canvas.height = 4
      const context = canvas.getContext('2d', { colorSpace: 'display-p3' })!
      context.fillStyle = '#3498db'
      context.fillRect(0, 0, 4, 4)
      return canvas.toDataURL().split(',')[1]!
    })
    image = Buffer.from(source, 'base64')
  }
  finally {
    await browser.close()
  }
  const raw = PNG.sync.read(image)
  expect(Math.abs(raw.data[0]! - 52)).toBeGreaterThan(8)
  const corrected = PNG.sync.read(await normalizeScreenshotToSrgb(image))
  for (const [index, expected] of [52, 152, 219, 255].entries()) {
    expect(Math.abs(corrected.data[index]! - expected)).toBeLessThanOrEqual(2)
  }
})
