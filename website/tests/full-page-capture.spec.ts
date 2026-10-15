import type { Buffer } from 'node:buffer'
import { expect, test } from '@playwright/test'
import { PNG } from 'pngjs'
import { captureFullPageSample, createCaptureBudget } from './helpers/full-page/capture'
import { captureStableFullPage } from './helpers/full-page/stable'

test.describe('complete full-page capture', () => {
  test('preserves pixels across the Firefox height limit and tile seams', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 240 })
    await page.setContent(`<style>
      body { margin: 0; }
      div { height: 16000px; }
    </style><div style="background:red"></div><div style="background:lime"></div>
    <div style="height:1001px;background:blue"></div>`)
    const before = await page.evaluate(() => [scrollX, scrollY, innerWidth, innerHeight, devicePixelRatio])
    const image = PNG.sync.read(await captureStableFullPage(page))
    expect([image.width, image.height]).toEqual([320, 33001])
    for (const y of [0, 15999, 16000, 31999, 32000, 33000]) {
      const expected = y < 16000 ? [255, 0, 0, 255] : y < 32000 ? [0, 255, 0, 255] : [0, 0, 255, 255]
      expect([...image.data.subarray(y * image.width * 4, y * image.width * 4 + 4)]).toEqual(expected)
    }
    expect(await page.evaluate(() => [scrollX, scrollY, innerWidth, innerHeight, devicePixelRatio])).toEqual(before)
  })

  test('preserves pixels across the Firefox width limit and final partial tile', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 240 })
    await page.setContent(`<style>
      body { margin: 0; display:flex; }
      div { flex-shrink:0; width:16000px; height:240px; }
    </style><div style="background:red"></div><div style="background:lime"></div>
    <div style="width:1001px;background:blue"></div>`)
    const before = await page.evaluate(() => [scrollX, scrollY, innerWidth, innerHeight, devicePixelRatio])
    const image = PNG.sync.read(await captureStableFullPage(page))
    expect([image.width, image.height]).toEqual([33001, 240])
    for (const x of [0, 15999, 16000, 31999, 32000, 33000]) {
      const expected = x < 16000 ? [255, 0, 0, 255] : x < 32000 ? [0, 255, 0, 255] : [0, 0, 255, 255]
      expect([...image.data.subarray(x * 4, x * 4 + 4)]).toEqual(expected)
    }
    expect(await page.evaluate(() => [scrollX, scrollY, innerWidth, innerHeight, devicePixelRatio])).toEqual(before)
  })

  test('matches every native pixel with fixed, sticky and iframe content', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 240 })
    await page.setContent(`<style>
      body { margin: 0; width: 430px; height: 911px; background: rebeccapurple; }
      .fixed { position: fixed; top: 20px; left: 40px; width: 50px; height: 40px; background: lime; }
      .sticky { position: sticky; top: 12px; width: 100px; height: 24px; background: yellow; }
      iframe { position: absolute; top: 270px; left: 111px; width: 210px; height: 180px; border: 0; }
    </style><div class="sticky"></div><div class="fixed"></div>
    <iframe srcdoc="<style>body{background:cyan}</style><p>iframe</p>"></iframe>`)
    await expect(page.frameLocator('iframe').locator('p')).toHaveText('iframe')
    const options = { fullPage: true, animations: 'disabled', caret: 'hide', scale: 'css', type: 'png' } as const
    const native = PNG.sync.read(await page.screenshot(options))
    const before = await page.evaluate(() => [scrollX, scrollY, innerWidth, innerHeight, devicePixelRatio])
    const tiled = PNG.sync.read(await captureStableFullPage(page, { tileSize: 127 }))
    expect([tiled.width, tiled.height]).toEqual([native.width, native.height])
    if (!tiled.data.equals(native.data)) {
      const pixels = []
      for (let offset = 0; offset < native.data.length; offset += 4) {
        if (!native.data.subarray(offset, offset + 4).equals(tiled.data.subarray(offset, offset + 4))) {
          pixels.push({ x: offset / 4 % native.width, y: Math.floor(offset / 4 / native.width), native: [...native.data.subarray(offset, offset + 4)], tiled: [...tiled.data.subarray(offset, offset + 4)] })
        }
      }
      const differences = JSON.stringify({ count: pixels.length, first: pixels.slice(0, 30) })
      await testInfo.attach('pixel-differences', { body: differences, contentType: 'application/json' })
      await testInfo.attach('native', { body: PNG.sync.write(native), contentType: 'image/png' })
      await testInfo.attach('tiled', { body: PNG.sync.write(tiled), contentType: 'image/png' })
      expect(pixels.length, differences).toBe(0)
    }
    expect(tiled.data.equals(native.data)).toBe(true)
    expect(await page.evaluate(() => [scrollX, scrollY, innerWidth, innerHeight, devicePixelRatio])).toEqual(before)
  })

  test('invalidates a shrinking document and captures two complete replacement samples', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 240 })
    await page.setContent('<style>body{margin:0;height:900px;background:red}</style>')
    const screenshot = page.screenshot.bind(page)
    let calls = 0
    page.screenshot = async (options) => {
      const image = await screenshot(options)
      if (++calls === 1) {
        await page.evaluate(() => {
          document.body.style.height = '410px'
        })
      }
      return image
    }
    try {
      const image = PNG.sync.read(await captureStableFullPage(page, { tileSize: 250 }))
      expect([image.width, image.height]).toEqual([320, 410])
      expect(calls).toBeGreaterThanOrEqual(9)
      expect([...image.data.subarray(-4)]).toEqual([255, 0, 0, 255])
    }
    finally {
      page.screenshot = screenshot
    }
  })

  test('requires consecutive complete images after content changes between samples', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 240 })
    await page.setContent('<style>body{margin:0;height:240px;background:red}</style>')
    const screenshot = page.screenshot.bind(page)
    let calls = 0
    page.screenshot = async (options) => {
      const image = await screenshot(options)
      if (++calls === 1) {
        await page.evaluate(() => {
          document.body.style.background = 'blue'
        })
      }
      return image
    }
    try {
      const image = PNG.sync.read(await captureStableFullPage(page))
      expect(calls).toBe(3)
      expect([...image.data.subarray(0, 4)]).toEqual([0, 0, 255, 255])
    }
    finally {
      page.screenshot = screenshot
    }
  })

  test('uses one deadline even when a tile screenshot never settles', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 240 })
    await page.setContent('<style>body{margin:0;height:600px}</style>')
    const screenshot = page.screenshot.bind(page)
    const timeouts: number[] = []
    page.screenshot = async (options) => {
      timeouts.push(options!.timeout!)
      if (timeouts.length > 1) {
        return await new Promise<Buffer>(() => {})
      }
      return await screenshot(options)
    }
    const start = performance.now()
    try {
      await expect(captureStableFullPage(page, { timeout: 1000, tileSize: 250 })).rejects.toThrow('共享预算已耗尽')
      expect(timeouts).toHaveLength(2)
      expect(timeouts[1]).toBeLessThan(timeouts[0])
      expect(performance.now() - start).toBeLessThan(1800)
    }
    finally {
      page.screenshot = screenshot
    }
  })

  test('rejects a truncated tile with unchanged geometry', async ({ page }) => {
    await page.setContent('<style>body{margin:0;height:600px}</style>')
    const screenshot = page.screenshot.bind(page)
    page.screenshot = options => screenshot({ ...options, clip: { x: 0, y: 0, width: 10, height: 10 } })
    try {
      await expect(captureFullPageSample(page, createCaptureBudget(1000))).rejects.toThrow('分片尺寸不符')
    }
    finally {
      page.screenshot = screenshot
    }
  })

  test('preserves the screenshot error when geometry inspection also fails', async ({ page }) => {
    await page.setContent('<style>body{margin:0;height:600px}</style>')
    const screenshot = page.screenshot.bind(page)
    const original = new Error('首个截图失败 marker')
    page.screenshot = async () => {
      await page.close()
      throw original
    }
    try {
      await expect(captureFullPageSample(page, createCaptureBudget(1000))).rejects.toBe(original)
    }
    finally {
      page.screenshot = screenshot
    }
  })
})
