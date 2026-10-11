import type { PNG } from 'pngjs'

interface Rect {
  height: number
  left: number
  top: number
  width: number
}

function scaleRect(rect: Rect, scaleX: number, scaleY: number): Rect {
  return {
    height: rect.height * scaleY,
    left: rect.left * scaleX,
    top: rect.top * scaleY,
    width: rect.width * scaleX,
  }
}

function expandRect(rect: Rect, padding: number): Rect {
  return {
    height: rect.height + padding * 2,
    left: rect.left - padding,
    top: rect.top - padding,
    width: rect.width + padding * 2,
  }
}

function countPixels(png: PNG, rect: Rect, matcher: (red: number, green: number, blue: number, alpha: number) => boolean) {
  const left = Math.max(0, Math.floor(rect.left))
  const top = Math.max(0, Math.floor(rect.top))
  const right = Math.min(png.width, Math.ceil(rect.left + rect.width))
  const bottom = Math.min(png.height, Math.ceil(rect.top + rect.height))
  let pixels = 0

  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const index = (png.width * y + x) * 4
      const red = png.data[index] ?? 0
      const green = png.data[index + 1] ?? 0
      const blue = png.data[index + 2] ?? 0
      const alpha = png.data[index + 3] ?? 0
      if (matcher(red, green, blue, alpha)) {
        pixels++
      }
    }
  }

  return pixels
}

function isRed(red: number, green: number, blue: number, alpha: number) {
  return alpha > 180 && red > 150 && green < 90 && blue < 90
}

function isGreen(red: number, green: number, blue: number, alpha: number) {
  return alpha > 180 && green > 110 && red < 90 && blue < 110
}

function isBlue(red: number, green: number, blue: number, alpha: number) {
  return alpha > 180 && blue > 130 && red < 90 && green > 70 && green < 140
}

export function sampleSelectorPixels(screenshot: PNG, rect: Rect, pageWidth: number, borderTopWidth: number) {
  const scale = screenshot.width / pageWidth
  const targetRect = expandRect(scaleRect(rect, scale, scale), -4 * scale)
  // 顶边与内部背景使用不同区域，不能将待测边框随内缩一起排除。
  const borderRect = scaleRect({ ...rect, height: borderTopWidth }, scale, scale)
  return {
    bluePixels: countPixels(screenshot, borderRect, isBlue),
    greenPixels: countPixels(screenshot, targetRect, isGreen),
    redPixels: countPixels(screenshot, targetRect, isRed),
    targetRect,
    borderRect,
  }
}
