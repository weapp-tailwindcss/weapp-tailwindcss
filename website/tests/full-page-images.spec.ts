import type { Route } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { PNG } from 'pngjs'
import { createCaptureBudget } from './helpers/full-page/capture'
import { prepareFullPageImages } from './helpers/full-page/images'
import { captureStableFullPage } from './helpers/full-page/stable'

test('full-page capture loads lazy images and restores the original scroll position', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 240 })
  await page.route('http://capture.fixture/green.svg', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="20"><rect width="32" height="20" fill="lime"/></svg>',
  }))
  await page.setContent(`<style>body{margin:0;background:red}.spacer{height:6000px}img{display:block;width:32px;height:20px}</style>
    <div class="spacer"></div><img loading="lazy" src="http://capture.fixture/green.svg">`)
  await page.evaluate(() => scrollTo(0, 23))
  expect(await page.locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(0)
  const before = await page.evaluate(() => [scrollX, scrollY, innerWidth, innerHeight, devicePixelRatio])
  const captured = PNG.sync.read(await captureStableFullPage(page))
  expect(await page.locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(32)
  expect(await page.evaluate(() => [scrollX, scrollY, innerWidth, innerHeight, devicePixelRatio])).toEqual(before)
  const offset = (6001 * captured.width + 1) * 4
  expect([...captured.data.subarray(offset, offset + 4)]).toEqual([0, 255, 0, 255])
})

test('image preparation restores nested scroll containers and excludes hidden images', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 240 })
  await page.route('http://capture.fixture/green.svg', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="20"><rect width="32" height="20" fill="lime"/></svg>',
  }))
  await page.setContent(`<style>body{margin:0}.outer{height:6000px}.scroller{width:160px;height:100px;overflow:auto}.inner{width:6000px;height:6000px}#target{margin-left:5900px;width:32px;height:20px}</style>
    <div class="outer"></div><div class="scroller"><div class="inner"></div>
    <img id="target" loading="lazy" src="http://capture.fixture/green.svg"></div>
    <img style="display:none" src="http://capture.fixture/hidden.svg">`)
  await page.evaluate(() => {
    document.querySelector('.scroller')!.scrollTop = 17
    document.querySelector('.scroller')!.scrollLeft = 19
    scrollTo(0, 23)
  })
  const positions = () => page.evaluate(() => [scrollX, scrollY, document.querySelector('.scroller')!.scrollTop, document.querySelector('.scroller')!.scrollLeft])
  const before = await positions()
  await prepareFullPageImages(page, createCaptureBudget(5000))
  expect(await page.locator('#target').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(32)
  expect(await positions()).toEqual(before)
})

test('a failed image rejects capture and restores scroll instead of accepting an alt placeholder', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 240 })
  await page.route('http://capture.fixture/broken.svg', route => route.fulfill({ status: 404, body: 'missing image' }))
  await page.setContent('<style>body{margin:0}div{height:6000px}img{width:32px;height:20px}</style><div></div><img loading="lazy" src="http://capture.fixture/broken.svg">')
  await page.evaluate(() => scrollTo(0, 23))
  await expect(captureStableFullPage(page)).rejects.toThrow('图片加载失败：http://capture.fixture/broken.svg')
  expect(await page.evaluate(() => scrollY)).toBe(23)
})

test('a stalled lazy image consumes the shared deadline and still restores scroll', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 240 })
  let blocked: Route | undefined
  await page.route('http://capture.fixture/stalled.svg', (route) => {
    blocked = route
  })
  let secondRequested = false
  await page.route('http://capture.fixture/second.svg', (route) => {
    secondRequested = true
    return route.fulfill({ status: 404, body: 'late loop must not request this image' })
  })
  await page.setContent('<style>body{margin:0}div{height:6000px}img{width:32px;height:20px}</style><div></div><img id="first" loading="lazy" src="http://capture.fixture/stalled.svg"><div></div><img loading="lazy" src="http://capture.fixture/second.svg">')
  await page.evaluate(() => scrollTo(0, 23))
  const start = performance.now()
  try {
    await expect(captureStableFullPage(page, { timeout: 1000 })).rejects.toThrow('共享预算已耗尽')
    expect(await page.evaluate(() => scrollY)).toBe(23)
    expect(performance.now() - start).toBeLessThan(1800)
    expect(blocked).toBeDefined()
    await blocked!.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="20"><rect width="32" height="20" fill="lime"/></svg>',
    })
    blocked = undefined
    await page.locator('#first').evaluate(async (node) => {
      await (node as HTMLImageElement).decode()
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    })
    expect(await page.evaluate(() => scrollY)).toBe(23)
    expect(secondRequested).toBe(false)
  }
  finally {
    await blocked?.abort()
  }
})

test('a loaded image can remove itself without losing the next image identity', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 240 })
  await page.route('http://capture.fixture/*.svg', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="20"><rect width="32" height="20" fill="lime"/></svg>',
  }))
  await page.setContent(`<style>body{margin:0}div{height:6000px}img{width:32px;height:20px}</style>
    <div></div><img id="first" loading="lazy" src="http://capture.fixture/first.svg" onload="this.remove()">
    <div></div><img id="second" loading="lazy" src="http://capture.fixture/second.svg">`)
  await prepareFullPageImages(page, createCaptureBudget(5000))
  await expect(page.locator('#first')).toHaveCount(0)
  expect(await page.locator('#second').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(32)
  expect(await page.evaluate(() => scrollY)).toBe(0)
})
