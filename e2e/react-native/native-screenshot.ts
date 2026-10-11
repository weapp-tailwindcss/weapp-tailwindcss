import type { PNG } from 'pngjs'
import type { NativeVisualProbe } from '../../examples/react-native-expo/src/visual-probes'

const requiredProbeIds = ['theme-card', 'tsx-hmr', 'css-hmr']

/** 按本轮原生窗口坐标验证背景像素，拒绝刷新遮罩、旧颜色和不可见探针。 */
export function assessNativeScreenshot(png: PNG, probes: NativeVisualProbe[], pixelRatio: number) {
  const complete = probes?.length === requiredProbeIds.length
    && requiredProbeIds.every(id => probes.filter(probe => probe.id === id).length === 1)
  if (!complete || !Number.isFinite(pixelRatio) || pixelRatio <= 0) {
    return { passed: false, probes: [], reason: 'missing probes or invalid pixel ratio' }
  }
  const results = probes.map(({ id, bounds, rgb }) => {
    const left = Math.round(bounds.x * pixelRatio)
    const top = Math.round(bounds.y * pixelRatio)
    const right = Math.round((bounds.x + bounds.width) * pixelRatio)
    const bottom = Math.round((bounds.y + bounds.height) * pixelRatio)
    const valid = [left, top, right, bottom, ...rgb].every(Number.isFinite)
      && rgb.length === 3 && rgb.every(value => value >= 0 && value <= 255)
      && left >= 0 && top >= 0 && right <= png.width && bottom <= png.height
      && right > left && bottom > top
    if (!valid) {
      return { id, passed: false, matchedRatio: 0, reason: 'invalid or clipped bounds' }
    }
    let matched = 0
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        const index = (y * png.width + x) * 4
        if (png.data[index + 3] === 255 && rgb.every((value, channel) => Math.abs(png.data[index + channel]! - value) <= 8)) {
          matched++
        }
      }
    }
    const matchedRatio = matched / ((right - left) * (bottom - top))
    return { id, passed: matchedRatio >= 0.7, matchedRatio }
  })
  return { passed: results.every(result => result.passed), probes: results }
}
