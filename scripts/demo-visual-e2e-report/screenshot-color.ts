import { Buffer } from 'node:buffer'
import { chromium } from 'playwright'
import { resolveChromeExecutable } from '../../e2e/hbuilderx-local/process'

export function hasPngColorProfile(image: Buffer) {
  for (let offset = 8; offset + 12 <= image.length;) {
    const length = image.readUInt32BE(offset)
    if (offset + length + 12 > image.length) {
      return false
    }
    if (image.toString('ascii', offset + 4, offset + 8) === 'iCCP') {
      return true
    }
    offset += length + 12
  }
  return false
}

/** 在裁剪或逐像素断言之前解码 ICC，避免 PNG 重编码丢失屏幕色彩配置。 */
export async function normalizeScreenshotToSrgb(image: Buffer) {
  if (!hasPngColorProfile(image)) {
    return image
  }
  const executablePath = await resolveChromeExecutable()
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
  try {
    const page = await browser.newPage()
    const data = await page.evaluate(async (source) => {
      const image = new Image()
      image.src = source
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d', { colorSpace: 'srgb' })!
      context.drawImage(image, 0, 0)
      return canvas.toDataURL('image/png').split(',')[1]!
    }, `data:image/png;base64,${image.toString('base64')}`)
    return Buffer.from(data, 'base64')
  }
  finally {
    await browser.close()
  }
}
