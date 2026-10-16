import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { expect } from 'vitest'
import { cropPng } from './visual'

export type Issue928BaselinePaths = Readonly<Partial<Record<1 | 2, string>>>

/** 只按当前原图与运行时视口的真实采样比例选择已登记基线。 */
export function selectIssue928Baseline(screenshotWidth: number, viewportWidth: number, paths: Issue928BaselinePaths) {
  const scale = screenshotWidth / viewportWidth
  if (![screenshotWidth, viewportWidth].every(value => Number.isFinite(value) && value > 0)
    || (scale !== 1 && scale !== 2)) {
    throw new Error(`渐变像素基线仅支持已登记的 1x/2x 整数采样，实际为 ${screenshotWidth}/${viewportWidth}=${scale}。请确认当前项目为 100% 且窗口完整容纳模拟器，不按显示器分辨率或设备 pixelRatio 猜测基线。`)
  }
  const baselinePath = paths[scale]
  if (!baselinePath) {
    throw new Error(`缺少 ${scale}x 渐变像素基线的明确登记；不能退回其它密度或自动生成基线。`)
  }
  return { path: baselinePath, scale }
}

/** 在相同采样条件下保持原来的尺寸、颜色差异和抗锯齿比较规则。 */
export function compareIssue928Baseline(actual: PNG, baseline: PNG) {
  expect(Math.abs(baseline.width - actual.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(baseline.height - actual.height)).toBeLessThanOrEqual(1)
  const width = Math.min(actual.width, baseline.width)
  const height = Math.min(actual.height, baseline.height)
  const rect = { left: 0, top: 0, width, height }
  const actualPng = cropPng(actual, rect)
  const baselinePng = cropPng(baseline, rect)
  const diff = new PNG({ width, height })
  const differentPixels = pixelmatch(actualPng.data, baselinePng.data, diff.data, width, height, {
    threshold: 0.1,
  })
  return { diff, differentPixels, ratio: Math.round((differentPixels / (width * height)) * 10000) / 10000 }
}
