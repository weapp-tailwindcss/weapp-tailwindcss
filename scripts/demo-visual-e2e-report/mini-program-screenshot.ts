import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import path from 'node:path'
import { PNG } from 'pngjs'
import { normalizeScreenshotToSrgb } from './screenshot-color'

interface WindowMetrics {
  screenWidth: number
  screenHeight: number
  screenTop: number
  windowWidth: number
  windowHeight: number
  viewportTop?: number
  hasNativeTabBar?: boolean
}

export function cropMiniProgramViewport(image: PNG, metrics: WindowMetrics): PNG {
  if (!metrics) {
    throw new TypeError('小程序运行时尚未返回窗口几何信息。')
  }
  const { screenWidth, screenHeight, windowWidth, windowHeight } = metrics
  const screenTop = metrics.viewportTop ?? metrics.screenTop
  if (![screenWidth, screenHeight, windowWidth, windowHeight].every(value => Number.isFinite(value) && value > 0)
    || !Number.isFinite(screenTop) || screenTop < 0 || screenTop + windowHeight > screenHeight + 1) {
    throw new Error('小程序截图缺少有效的窗口几何信息。')
  }
  const scale = image.width / screenWidth
  if (Math.abs(image.height - screenHeight * scale) > 2) {
    throw new Error('小程序截图尺寸与运行时屏幕比例不一致。')
  }
  const top = Math.round(screenTop * scale)
  const width = Math.round(windowWidth * scale)
  const height = Math.min(Math.round(windowHeight * scale), image.height - top)
  if (width > image.width || height <= 0) {
    throw new Error('小程序窗口超出截图范围。')
  }
  const result = new PNG({ width, height })
  PNG.bitblt(image, result, 0, top, width, height, 0, 0)
  return result
}

export async function readMiniProgramWindowMetrics(miniProgram: any, timeout: number): Promise<WindowMetrics> {
  const deadline = Date.now() + timeout
  let lastError: unknown
  do {
    try {
      const code = `function () {
        var metrics = wx.getWindowInfo()
        if (metrics && typeof __wxConfig !== 'undefined' && typeof getCurrentPages === 'function') {
          var pages = getCurrentPages()
          var current = pages[pages.length - 1]
          var tabBar = __wxConfig.tabBar
          if (current && typeof current.route === 'string') {
            metrics.hasNativeTabBar = !!(tabBar && !tabBar.custom && Array.isArray(tabBar.list) && tabBar.list.some(function (item) {
              return item.pagePath.replace(/\\.html$/, '') === current.route
            }))
          }
        }
        return metrics
      }`
      const metrics = typeof miniProgram.evaluateWithOptions === 'function'
        ? await miniProgram.evaluateWithOptions(code, { timeout: Math.min(3000, Math.max(1, deadline - Date.now())) })
        : await miniProgram.evaluate(code)
      if (metrics && [metrics.screenWidth, metrics.screenHeight, metrics.windowWidth, metrics.windowHeight].every(value => Number.isFinite(value) && value > 0)
        && Number.isFinite(metrics.screenTop)) {
        return metrics
      }
      lastError = new Error('窗口 API 尚未返回有效几何信息')
    }
    catch (error) {
      if (!(error instanceof Error) || !/wx is not defined|getWindowInfo is not a function|timeout|did not respond.*within/i.test(error.message)) {
        throw error
      }
      lastError = error
    }
    if (Date.now() >= deadline) {
      break
    }
    await new Promise(resolve => setTimeout(resolve, Math.min(100, deadline - Date.now())))
  } while (Date.now() <= deadline)
  throw new Error('小程序运行时窗口 API 未在限定时间内就绪。', { cause: lastError })
}

export async function readMiniProgramViewportMetrics(miniProgram: any, timeout: number): Promise<WindowMetrics> {
  const deadline = Date.now() + timeout
  let lastError: unknown
  do {
    try {
      const remaining = Math.max(1, deadline - Date.now())
      const metrics = await readMiniProgramWindowMetrics(miniProgram, remaining)
      if (metrics.hasNativeTabBar === false) {
        return metrics
      }
      const page = await miniProgram.currentPage({ timeout: Math.min(3000, remaining) })
      if (page) {
        const { properties } = await page.send('Page.getWindowProperties', {
          names: ['__devtoolsConfig.navigationBarHeight', '__devtoolsConfig.statusBarHeight'],
        }, { timeout: Math.min(3000, remaining) })
        if (Array.isArray(properties) && properties.length === 2
          && properties.every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)) {
          // DevTools 的 screenTop 包含底部 tabBar，裁剪原点必须来自当前页面顶部栏。
          return { ...metrics, viewportTop: properties[0] + properties[1] }
        }
      }
      lastError = new Error('小程序页面未返回有效的原生顶部栏高度。')
    }
    catch (error) {
      if (!(error instanceof Error) || !/page destroyed|timeout|did not respond.*within|not registered|not found/i.test(error.message)) {
        throw error
      }
      lastError = error
    }
    await new Promise(resolve => setTimeout(resolve, Math.min(100, Math.max(0, deadline - Date.now()))))
  } while (Date.now() < deadline)
  throw new Error('小程序页面视口未在限定时间内就绪。', { cause: lastError })
}

/** 保存未经裁剪的真实截图，运行时尺寸仅作证据，不推断宿主截图比例。 */
export async function captureMiniProgramScreenshot(miniProgram: any, screenshotPath: string, timeout: number) {
  const metrics = await readMiniProgramWindowMetrics(miniProgram, timeout)
  if (metrics.screenTop < 0 || metrics.screenTop + metrics.windowHeight > metrics.screenHeight + 1
    || metrics.windowWidth > metrics.screenWidth) {
    throw new Error('小程序截图缺少有效的窗口几何信息。')
  }
  const result = await miniProgram.send('App.captureScreenshot', {}, { timeout })
  if (typeof result?.data !== 'string') {
    throw new TypeError('小程序截图接口未返回图像。')
  }
  const fullImage = Buffer.from(result.data, 'base64')
  const image = PNG.sync.read(fullImage)
  if (image.width <= 0 || image.height <= 0) {
    throw new Error('小程序截图尺寸无效。')
  }
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true })
  await fs.writeFile(screenshotPath, fullImage)
  await fs.writeFile(`${screenshotPath}.capture.json`, `${JSON.stringify({
    kind: 'full-screen',
    image: { width: image.width, height: image.height },
    runtime: metrics,
  }, null, 2)}\n`)
  return image
}

export async function captureMiniProgramViewport(miniProgram: any, screenshotPath: string, timeout: number) {
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true })
  const metrics = await readMiniProgramViewportMetrics(miniProgram, timeout)
  const result = await miniProgram.send('App.captureScreenshot', {}, { timeout })
  if (typeof result?.data !== 'string') {
    throw new TypeError('小程序截图接口未返回图像。')
  }
  const fullImage = Buffer.from(result.data, 'base64')
  await fs.writeFile(`${screenshotPath}.full.png`, fullImage)
  await fs.writeFile(`${screenshotPath}.viewport.json`, `${JSON.stringify(metrics, null, 2)}\n`)
  const viewport = cropMiniProgramViewport(PNG.sync.read(await normalizeScreenshotToSrgb(fullImage)), metrics)
  await fs.writeFile(screenshotPath, PNG.sync.write(viewport))
  return viewport
}
