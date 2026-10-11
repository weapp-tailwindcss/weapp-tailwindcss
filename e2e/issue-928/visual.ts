import { PNG } from 'pngjs'

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export function expandRect(rect: Rect, padding: number): Rect {
  return {
    left: rect.left - padding,
    top: rect.top - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  }
}

export function scaleRect(rect: Rect, scaleX: number, scaleY: number): Rect {
  return {
    left: rect.left * scaleX,
    top: rect.top * scaleY,
    width: rect.width * scaleX,
    height: rect.height * scaleY,
  }
}

export function countEmeraldPixels(png: PNG, rect: Rect) {
  return countPixels(png, rect, ({ alpha, blue, green, red }) => {
    return alpha > 180 && green > 130 && green > red + 30 && green > blue + 20
  })
}

export function countAmberPixels(png: PNG, rect: Rect) {
  return countPixels(png, rect, ({ alpha, blue, green, red }) => {
    return alpha > 180 && red > 180 && green > 120 && blue < 80
  })
}

export function countBluePixels(png: PNG, rect: Rect) {
  return countPixels(png, rect, ({ alpha, blue, red }) => {
    return alpha > 180 && blue > 120 && blue > red + 30
  })
}

export function countCyanPixels(png: PNG, rect: Rect) {
  return countPixels(png, rect, ({ alpha, blue, green, red }) => {
    return alpha > 180 && green > 130 && blue > 130 && green > red + 35
  })
}

export function countPurplePixels(png: PNG, rect: Rect) {
  return countPixels(png, rect, ({ alpha, blue, green, red }) => {
    return alpha > 180 && red > 120 && blue > 120 && blue > green + 30
  })
}

export function countRedPixels(png: PNG, rect: Rect) {
  return countPixels(png, rect, ({ alpha, blue, green, red }) => {
    return alpha > 180 && red > 150 && red > green + 40 && red > blue + 30
  })
}

export function countYellowPixels(png: PNG, rect: Rect) {
  return countPixels(png, rect, ({ alpha, blue, green, red }) => {
    return alpha > 180 && red > 180 && green > 150 && blue < 130
  })
}

export function countPixels(
  png: PNG,
  rect: Rect,
  predicate: (color: { alpha: number, blue: number, green: number, red: number }) => boolean,
) {
  const left = Math.max(0, Math.floor(rect.left))
  const top = Math.max(0, Math.floor(rect.top))
  const right = Math.min(png.width, Math.ceil(rect.left + rect.width))
  const bottom = Math.min(png.height, Math.ceil(rect.top + rect.height))
  let pixels = 0

  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const index = (png.width * y + x) * 4
      const red = png.data[index]!
      const green = png.data[index + 1]!
      const blue = png.data[index + 2]!
      const alpha = png.data[index + 3]!

      if (predicate({ alpha, blue, green, red })) {
        pixels++
      }
    }
  }

  return pixels
}

export function cropPng(source: PNG, rect: Rect) {
  const left = Math.max(0, Math.floor(rect.left))
  const top = Math.max(0, Math.floor(rect.top))
  const right = Math.min(source.width, Math.ceil(rect.left + rect.width))
  const bottom = Math.min(source.height, Math.ceil(rect.top + rect.height))
  const width = Math.max(0, right - left)
  const height = Math.max(0, bottom - top)
  const cropped = new PNG({ width, height })

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sourceIndex = (source.width * (top + y) + (left + x)) * 4
      const targetIndex = (width * y + x) * 4
      cropped.data[targetIndex] = source.data[sourceIndex] ?? 0
      cropped.data[targetIndex + 1] = source.data[sourceIndex + 1] ?? 0
      cropped.data[targetIndex + 2] = source.data[sourceIndex + 2] ?? 0
      cropped.data[targetIndex + 3] = source.data[sourceIndex + 3] ?? 0
    }
  }

  return cropped
}

export function unionRect(...rects: Rect[]) {
  const left = Math.min(...rects.map(rect => rect.left))
  const top = Math.min(...rects.map(rect => rect.top))
  const right = Math.max(...rects.map(rect => rect.left + rect.width))
  const bottom = Math.max(...rects.map(rect => rect.top + rect.height))
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  }
}
