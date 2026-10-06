import type { MarkerColor } from '../../scripts/demo-visual-e2e-report/app-marker-visual'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { PNG } from 'pngjs'
import { countMarkerPixelChanges, locateMarkerColor } from '../../scripts/demo-visual-e2e-report/app-marker-visual'
import { parseHexColorFromClass } from './android-runtime'

/** 只使用启动时绑定的设备，异步截图让生命周期日志在取证期间继续到达。 */
export async function captureIosScreenshot(screenshot: string, deviceId: string | undefined, timeoutMs = 30_000) {
  if (!deviceId || deviceId === 'booted' || deviceId === 'simulator') {
    throw new Error('iOS 截图缺少已绑定的设备 UUID')
  }
  await fs.mkdir(path.dirname(screenshot), { recursive: true })
  // 清除自己上轮的同名图，避免命令未产出图片时读取旧证据。
  await fs.rm(screenshot, { force: true })
  await new Promise<void>((resolve, reject) => {
    const child = spawn('xcrun', ['simctl', 'io', deviceId, 'screenshot', screenshot], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
      killSignal: 'SIGTERM',
    })
    const logs: string[] = []
    child.stdout.on('data', chunk => logs.push(String(chunk)))
    child.stderr.on('data', chunk => logs.push(String(chunk)))
    child.once('error', reject)
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolve()
      }
      else {
        reject(new Error(`iOS 截图失败：exit=${code} signal=${signal ?? 'none'} ${logs.join('')}`))
      }
    })
  })
}

function countColor(image: PNG, color: MarkerColor, bounds: NonNullable<ReturnType<typeof locateMarkerColor>['bounds']>) {
  let count = 0
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const pixel = (y * image.width + x) * 4
      if (image.data[pixel + 3]! >= 8
        && Math.abs(image.data[pixel]! - color.red) <= 4
        && Math.abs(image.data[pixel + 1]! - color.green) <= 4
        && Math.abs(image.data[pixel + 2]! - color.blue) <= 4) {
        count++
      }
    }
  }
  return count
}

/** 验证唯一可见样式标记；不把截图当作节点文字的结构证据。 */
export function analyzeIosRuntimeScreenshot(image: PNG, markerClass: string, previous?: { image: PNG, markerClass: string }) {
  const color = parseHexColorFromClass(markerClass)
  if (!color) {
    throw new Error('iOS 运行时验收需要显式十六进制背景色标记')
  }
  const marker = locateMarkerColor(image, color, markerClass)
  let markerPixelChanges: number | undefined
  if (previous && marker.bounds) {
    if (image.width !== previous.image.width || image.height !== previous.image.height) {
      throw new Error('iOS HMR 前后截图尺寸不一致')
    }
    const previousColor = parseHexColorFromClass(previous.markerClass)
    const previousMarker = previousColor && locateMarkerColor(previous.image, previousColor, previous.markerClass)
    if (!previousMarker?.bounds || previousMarker.candidateCount !== 1) {
      throw new Error('iOS HMR 无法唯一定位初始样式标记')
    }
    const sameColor = previousColor?.red === color.red && previousColor.green === color.green && previousColor.blue === color.blue
    markerPixelChanges = sameColor
      ? countMarkerPixelChanges(previous.image, image, color, previousMarker.bounds, marker.bounds)
      : countColor(image, color, marker.bounds) - countColor(previous.image, color, marker.bounds)
  }
  return {
    evidenceKind: 'visual-style-marker' as const,
    marker,
    markerPixelChanges,
    ready: marker.matched && marker.candidateCount === 1 && (!previous || (markerPixelChanges ?? 0) > 100),
  }
}

export async function waitForIosRuntimeEvidence(options: {
  deviceId: string | undefined
  ensureRunning: () => void
  markerClass: string
  previous?: { screenshot: string, markerClass: string }
  screenshot: string
  screenshotTimeoutMs?: number
  timeoutMs: number
}) {
  const previous = options.previous
    ? { image: PNG.sync.read(await fs.readFile(options.previous.screenshot)), markerClass: options.previous.markerClass }
    : undefined
  const startedAt = Date.now()
  let latest: ReturnType<typeof analyzeIosRuntimeScreenshot> | undefined
  while (Date.now() - startedAt < options.timeoutMs) {
    options.ensureRunning()
    await captureIosScreenshot(options.screenshot, options.deviceId, Math.max(1, Math.min(options.screenshotTimeoutMs ?? 30_000, options.timeoutMs - (Date.now() - startedAt))))
    options.ensureRunning()
    latest = analyzeIosRuntimeScreenshot(PNG.sync.read(await fs.readFile(options.screenshot)), options.markerClass, previous)
    options.ensureRunning()
    if (latest.ready) {
      return { ...latest, deviceId: options.deviceId, markerClass: options.markerClass, screenshot: options.screenshot, capturedAt: new Date().toISOString() }
    }
    await setTimeout(100)
  }
  throw new Error(`iOS 设备未出现本轮可见样式标记：${JSON.stringify(latest)}\nscreenshot=${options.screenshot}`)
}
