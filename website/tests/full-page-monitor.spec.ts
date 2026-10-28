import type { Page } from '@playwright/test'
import type { NativeCaptureEvidence } from './helpers/full-page/native'
import { expect, test } from '@playwright/test'
import { PNG } from 'pngjs'
import { createCaptureBudget } from './helpers/full-page/capture'
import { startCaptureMonitor, validCaptureWindow } from './helpers/full-page/monitor'
import { captureNativeSample, captureStableNativeFullPage } from './helpers/full-page/native'

test.use({ headless: true, viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
const policy = { hideOnScroll: false, minHeadingLevel: 2, maxHeadingLevel: 3 }
const active = 'table-of-contents__link--active'

async function fixture(page: Page) {
  await page.setContent(`<style>
    body{margin:0;height:3000px;background:linear-gradient(red,blue)}
    .navbar{position:fixed;top:0;height:63px}
    .table-of-contents{position:fixed;top:80px;right:10px}
    .toc-highlight{color:rgb(220,220,220);transition:color 200ms}
    .${active}{color:rgb(20,100,240)}
    #first{position:absolute;top:200px;height:30px;margin:0}
    #bottom{position:absolute;top:2980px;left:20px;width:20px;height:20px;background:lime}
    </style><nav class="navbar">nav</nav><h2 class="anchor" id="first">first</h2>
    <ul class="table-of-contents"><li><a class="toc-highlight table-of-contents__link ${active}" href="#first">first</a></li></ul>
    <div id="bottom"></div>`)
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  })
}

function observation(): NativeCaptureEvidence {
  return { window: null, before: null, after: null }
}

async function ownedMonitors(page: Page) {
  return page.evaluate(() => Object.getOwnPropertySymbols(window).filter(symbol => symbol.description?.startsWith('weapp-full-page-monitor:')).length)
}

test('keeps native fullPage complete and accepts only captures with consistent TOC geometry', async ({ page }) => {
  await fixture(page)
  const before = await page.locator('.table-of-contents').boundingBox()
  const screenshot = page.screenshot.bind(page)
  const samples: { before: typeof before, after: typeof before }[] = []
  page.screenshot = async (options) => {
    const before = await page.locator('.table-of-contents').boundingBox()
    const buffer = await screenshot(options)
    samples.push({ before, after: await page.locator('.table-of-contents').boundingBox() })
    return buffer
  }
  let image: PNG
  try {
    image = PNG.sync.read(await captureStableNativeFullPage(page, createCaptureBudget(10_000), policy))
  }
  finally {
    page.screenshot = screenshot
  }
  // 原生 fullPage 可能触发布局扰动；污染样本必须拒绝，最后两个样本均须几何一致。
  expect(samples.length).toBeGreaterThanOrEqual(2)
  for (const sample of samples.slice(-2)) {
    expect(sample.after).toEqual(sample.before)
  }
  expect(samples.at(-1)!.before).toEqual(samples.at(-2)!.before)
  expect([image.width, image.height]).toEqual([1280, 3000])
  const offset = (2990 * image.width + 30) * 4
  expect([...image.data.subarray(offset, offset + 4)]).toEqual([0, 255, 0, 255])
  const after = await page.locator('.table-of-contents').boundingBox()
  expect(after!.x + after!.width).toBe(before!.x + before!.width)
  expect(after!.y).toBe(before!.y)
  expect(page.viewportSize()).toEqual({ width: 1280, height: 720 })
  expect(await ownedMonitors(page)).toBe(0)
})

test('same-size resize notifications alone keep a sample valid', async ({ page }) => {
  await fixture(page)
  const monitor = await startCaptureMonitor(page, createCaptureBudget(2000))
  try {
    await page.evaluate(() => window.dispatchEvent(new Event('resize')))
    await monitor.settle()
    expect(validCaptureWindow(await monitor.finish())).toBe(true)
  }
  finally {
    await monitor.close()
  }
})

test('rejects ancestor geometry that changes and returns before any native screenshot', async ({ page }) => {
  await fixture(page)
  const monitor = await startCaptureMonitor(page, createCaptureBudget(2000))
  try {
    await page.locator('.table-of-contents').evaluate(async (toc) => {
      const element = toc as HTMLElement
      element.style.transform = 'translateX(2px)'
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      element.style.transform = ''
    })
    await monitor.settle()
    const evidence = await monitor.finish()
    expect(validCaptureWindow(evidence)).toBe(false)
    expect(evidence.disturbances).toContain('捕获期间 TOC 节点、高亮、实际颜色或几何改变')
  }
  finally {
    await monitor.close()
  }
})

for (const mode of ['active-return', 'remount', 'remount-transition', 'new-transition', 'viewport-return'] as const) {
  test(`rejects ${mode} inside a native screenshot even when final semantic readiness recovers`, async ({ page }) => {
    await fixture(page)
    const screenshot = page.screenshot.bind(page)
    page.screenshot = async (options) => {
      if (mode === 'viewport-return') {
        await page.setViewportSize({ width: 1, height: 1 })
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())))
        await page.setViewportSize({ width: 1280, height: 720 })
      }
      else {
        await page.evaluate(async ({ mode, active }) => {
          const link = document.querySelector('.toc-highlight')!
          if (mode === 'remount' || mode === 'remount-transition') {
            const toc = document.querySelector('.table-of-contents')!
            const replacement = toc.cloneNode(true) as Element
            const fresh = replacement.querySelector('.toc-highlight')!
            if (mode === 'remount-transition') {
              fresh.classList.remove(active)
            }
            toc.replaceWith(replacement)
            if (mode === 'remount-transition') {
              getComputedStyle(fresh).getPropertyValue('color')
              await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
              fresh.classList.add(active)
              await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
            }
          }
          else if (mode === 'active-return') {
            link.classList.remove(active)
            link.classList.add(active)
          }
          else {
            link.animate([{ color: 'white' }, { color: 'rgb(20,100,240)' }], { duration: 200 })
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
          }
        }, { mode, active })
      }
      return screenshot(options)
    }
    const evidence = observation()
    try {
      expect(await captureNativeSample(page, createCaptureBudget(5000), policy, evidence)).toBeUndefined()
      expect(evidence.before?.ready).toBe(true)
      expect(evidence.after?.ready).toBe(true)
      expect(evidence.window?.disturbances.length).toBeGreaterThan(0)
      expect(await ownedMonitors(page)).toBe(0)
    }
    finally {
      page.screenshot = screenshot
    }
  })
}

test('a rejected middle sample clears the preceding image and requires two new complete samples', async ({ page }) => {
  await fixture(page)
  const screenshot = page.screenshot.bind(page)
  let calls = 0
  page.screenshot = async (options) => {
    expect(options?.fullPage).toBe(true)
    expect(options?.clip).toBeUndefined()
    if (++calls === 2) {
      await page.locator('.table-of-contents').evaluate(node => node.replaceWith(node.cloneNode(true)))
    }
    return screenshot(options)
  }
  try {
    await captureStableNativeFullPage(page, createCaptureBudget(10_000), policy)
    expect(calls).toBeGreaterThanOrEqual(4)
  }
  finally {
    page.screenshot = screenshot
  }
})

test('continuous in-flight disturbances exhaust one shared deadline without a single-image fallback', async ({ page }) => {
  await fixture(page)
  const screenshot = page.screenshot.bind(page)
  const timeouts: number[] = []
  page.screenshot = async (options) => {
    timeouts.push(options!.timeout!)
    await page.locator('.toc-highlight').evaluate((node, active) => {
      node.classList.remove(active)
      node.classList.add(active)
    }, active)
    return screenshot(options)
  }
  const start = performance.now()
  try {
    await expect(captureStableNativeFullPage(page, createCaptureBudget(1200), policy)).rejects.toThrow('连续两张')
    expect(timeouts.length).toBeGreaterThan(1)
    expect(timeouts.at(-1)).toBeLessThan(timeouts[0]!)
    expect(performance.now() - start).toBeLessThan(2500)
    expect(await ownedMonitors(page)).toBe(0)
  }
  finally {
    page.screenshot = screenshot
  }
})

test('lost monitor state fails closed and releases owned listeners after a context change', async ({ page }) => {
  await fixture(page)
  const monitor = await startCaptureMonitor(page, createCaptureBudget(2000))
  try {
    await page.goto('about:blank')
    await expect(monitor.finish()).rejects.toThrow('状态丢失')
  }
  finally {
    await monitor.close()
  }
  expect(await ownedMonitors(page)).toBe(0)
})

test('screenshot failures retain the original error and clean up the owned monitor', async ({ page }) => {
  await fixture(page)
  const screenshot = page.screenshot.bind(page)
  const error = new Error('native screenshot original marker')
  page.screenshot = async () => {
    throw error
  }
  try {
    await expect(captureNativeSample(page, createCaptureBudget(2000), policy, observation())).rejects.toBe(error)
    expect(await ownedMonitors(page)).toBe(0)
  }
  finally {
    page.screenshot = screenshot
  }
})
