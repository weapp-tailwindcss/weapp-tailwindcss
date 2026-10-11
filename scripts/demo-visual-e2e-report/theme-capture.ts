import type { MiniProgramThemeExpectation } from './types'
import fs from 'node:fs/promises'
import path from 'node:path'
import { captureMiniProgramViewport, readMiniProgramWindowMetrics } from './mini-program-screenshot'
import { collectMiniProgramThemeScreenshotEvidence } from './theme'

interface ThemeRect {
  left: number
  top: number
  width: number
  height: number
}

interface ThemeGeometry {
  rootRect: ThemeRect | null
  manualRect: ThemeRect | null
  windowWidth: number
  windowHeight: number
}

export function isThemeTargetVisible(geometry: ThemeGeometry) {
  const { manualRect: rect, windowWidth, windowHeight } = geometry
  return Boolean(rect && rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.top >= 0
    && rect.left + rect.width <= windowWidth + 1 && rect.top + rect.height <= windowHeight + 1)
}

async function readThemeGeometry(miniProgram: any): Promise<ThemeGeometry> {
  return miniProgram.evaluate(`function () {
    return new Promise(function (resolve) {
      var query = wx.createSelectorQuery()
      query.select('.theme-mode-demo').boundingClientRect()
      query.select('.theme-dark').boundingClientRect()
      query.exec(function (rects) {
        var window = wx.getWindowInfo()
        resolve({ rootRect: rects[0], manualRect: rects[1], windowWidth: window.windowWidth, windowHeight: window.windowHeight })
      })
    })
  }`)
}

export async function captureMiniProgramThemeEvidence(miniProgram: any, page: any, screenshotPath: string, timeout: number, expectation?: MiniProgramThemeExpectation) {
  await readMiniProgramWindowMetrics(miniProgram, timeout)
  let geometry = await readThemeGeometry(miniProgram)
  const geometryLog: unknown[] = [{ stage: 'initial', geometry }]
  const saveGeometry = async () => {
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true })
    await fs.writeFile(`${screenshotPath}.geometry.json`, `${JSON.stringify(geometryLog, null, 2)}\n`)
  }
  await saveGeometry()
  if (!geometry.rootRect || !geometry.manualRect) {
    throw new Error('小程序主题截图无法定位真实主题节点。')
  }
  if (!isThemeTargetVisible(geometry)) {
    if (expectation?.scrollContainer) {
      const container = await page.$(expectation.scrollContainer)
      if (!container || typeof container.scrollTo !== 'function') {
        throw new Error('小程序主题滚动容器不可操作。')
      }
      const offset = await container.offset()
      const scrollTop = Number(await container.property('scrollTop'))
      geometryLog.push({ stage: 'scroll-container', offset, scrollTop })
      await saveGeometry()
      await container.scrollTo(0, scrollTop + geometry.manualRect.top - offset.top)
    }
    else {
      await miniProgram.evaluate(`function () {
        return new Promise(function (resolve, reject) {
          wx.pageScrollTo({ selector: '.theme-dark', duration: 0, success: resolve, fail: reject })
        })
      }`)
    }
    const deadline = Date.now() + Math.min(timeout, 5000)
    do {
      geometry = await readThemeGeometry(miniProgram)
      if (isThemeTargetVisible(geometry)) {
        break
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    } while (Date.now() < deadline)
  }
  geometryLog.push({ stage: 'after-scroll', geometry })
  await saveGeometry()
  if (!isThemeTargetVisible(geometry) || !geometry.rootRect || !geometry.manualRect) {
    throw new Error('小程序主题目标未完整进入截图窗口。')
  }
  const image = await captureMiniProgramViewport(miniProgram, screenshotPath, timeout)
  const evidence = await collectMiniProgramThemeScreenshotEvidence(page, image, {
    rootRect: geometry.rootRect,
    manualRect: geometry.manualRect,
    windowWidth: geometry.windowWidth,
  }, expectation)
  return { ...evidence, screenshotPath, geometry }
}
