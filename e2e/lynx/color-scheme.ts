import type { NativeCaseResult } from '../../examples/react-lynx/src/compatibility/types'
import type { PngPixels } from './png'

type Color = readonly number[]
const ink = [19, 32, 38]
const blue = [14, 165, 233]
const canvas = [247, 250, 251]

function close(first: Color, second: Color, tolerance = 10) {
  return first.every((channel, index) => Math.abs(channel - second[index]!) <= tolerance)
}

function color(image: PngPixels, index: number) {
  return [...image.data.subarray(index * 4, index * 4 + 3)]
}

function near(image: PngPixels, index: number, expected: Color) {
  const x = index % image.width
  const y = Math.floor(index / image.width)
  // 原生画布的物理像素取整最多容许一像素的字形边缘偏移，不移动或重采样截图。
  for (let row = Math.max(0, y - 1); row <= Math.min(image.height - 1, y + 1); row++) {
    for (let column = Math.max(0, x - 1); column <= Math.min(image.width - 1, x + 1); column++) {
      if (close(color(image, row * image.width + column), expected)) {
        return true
      }
    }
  }
  return false
}

function glyph(image: PngPixels) {
  const pixels = new Map<number, number>()
  const scale = image.width / 160
  for (let index = 0; index < image.width * image.height; index++) {
    if (image.data[index * 4 + 3] !== 255) {
      throw new Error('颜色模式夹具缺少不透明画布')
    }
    const x = (index % image.width + 0.5) / scale
    const y = (Math.floor(index / image.width) + 0.5) / scale
    const actual = color(image, index)
    if (x < 30 || x > 130 || y < 38 || y > 122) {
      if (!close(actual, canvas, 2)) {
        throw new Error('颜色模式夹具外部画布无效')
      }
      continue
    }
    if (x < 34 || x > 126 || y < 42 || y > 118 || close(actual, blue, 2)) {
      continue
    }
    const delta = ink.map((channel, i) => channel - blue[i]!)
    const alpha = delta.reduce((sum, channel, i) => sum + channel * (actual[i]! - blue[i]!), 0) / delta.reduce((sum, value) => sum + value * value, 0)
    const expected = blue.map((channel, i) => channel + delta[i]! * alpha)
    if (x < 42 || x > 118 || y < 52 || y > 108 || alpha < 0 || alpha > 1.05 || !close(actual, expected)) {
      throw new Error('颜色模式浅色或 control 文字夹具无效')
    }
    if (alpha >= 0.15) {
      pixels.set(index, Math.min(1, alpha))
    }
  }
  if (pixels.size < 40 * scale ** 2 || pixels.size > 2000 * scale ** 2) {
    throw new Error('颜色模式夹具缺少有效文字')
  }
  return pixels
}

/** 文字必须在相同位置从深色变白；其余三个画布须保持深色文字及背景。 */
export function evaluateColorScheme(images: PngPixels[]): NativeCaseResult {
  const [light, control, dark, darkControl] = images
  if (images.length !== 4 || !light || images.some(image => image.width < 160 || image.width !== image.height || image.width !== light.width)) {
    throw new Error('颜色模式缺少四张等尺寸完整画布')
  }
  const reference = glyph(light)
  for (const invariant of [control!, darkControl!]) {
    const mask = glyph(invariant)
    const matches = [...reference.keys()].filter(index => near(invariant, index, color(light, index))).length / reference.size
    const reverse = [...mask.keys()].filter(index => near(light, index, color(invariant, index))).length / mask.size
    if (matches < 0.97 || reverse < 0.97 || Math.abs(mask.size / reference.size - 1) > 0.1) {
      throw new Error('颜色模式浅色及 control 字形没有保持不变')
    }
  }
  let matched = 0
  let core = 0
  let invalidGlyphColors = 0
  let backgroundMismatch = 0
  for (let index = 0; index < light.width * light.height; index++) {
    if (dark!.data[index * 4 + 3] !== 255) {
      throw new Error('颜色模式深色截图缺少不透明画布')
    }
    const alpha = reference.get(index)
    if (alpha !== undefined) {
      // 深浅文字的抗锯齿 gamma 不同；比较实心笔画的白色和边缘的颜色方向，不能复用浅色 alpha。
      if (alpha >= 0.95) {
        core++
        if (near(dark!, index, [255, 255, 255])) {
          matched++
        }
      }
      const actual = color(dark!, index)
      const delta = blue.map(channel => 255 - channel)
      const whiteAlpha = delta.reduce((sum, channel, i) => sum + channel * (actual[i]! - blue[i]!), 0) / delta.reduce((sum, value) => sum + value * value, 0)
      const expected = blue.map((channel, i) => channel + delta[i]! * whiteAlpha)
      if (whiteAlpha < -0.02 || whiteAlpha > 1.02 || !close(actual, expected)) {
        invalidGlyphColors++
      }
    }
    else if (!near(light, index, color(dark!, index))) {
      // 只豁免参考字形一像素邻域，新增文字、背景变白或整张图片变化均不能通过。
      const x = index % light.width
      const y = Math.floor(index / light.width)
      let edge = false
      for (let row = Math.max(0, y - 1); row <= Math.min(light.height - 1, y + 1); row++) {
        for (let column = Math.max(0, x - 1); column <= Math.min(light.width - 1, x + 1); column++) {
          edge ||= reference.has(row * light.width + column)
        }
      }
      if (!edge) {
        backgroundMismatch++
      }
    }
  }
  if (core < 20 * (light.width / 160) ** 2) {
    throw new Error('颜色模式夹具缺少实心文字笔画')
  }
  const ratio = matched / core
  const passed = ratio >= 0.97 && backgroundMismatch === 0 && invalidGlyphColors === 0
  return {
    id: 'variant-dark',
    status: passed ? 'supported' : 'unsupported',
    ...(passed ? {} : { reason: '深色模式未仅将相同字形变为白色并保持背景及 control 不变', failureStage: 'runtime' as const }),
    checkpoints: [{ name: 'pixel:color-scheme-v1', passed, actual: JSON.stringify({ glyphPixels: reference.size, corePixels: core, whiteMatch: Math.round(ratio * 1000) / 1000, invalidGlyphColors, backgroundMismatch }), expected: 'light 深色字形 → dark 同字形白色；control 与背景不变' }],
  }
}

export function validateColorSchemeReceipts(result: NativeCaseResult, runId: string | undefined) {
  const receipts = result.colorScheme
  if (!runId || !receipts || Object.keys(receipts).length !== 3) {
    throw new Error('颜色模式缺少本轮切换及恢复回执')
  }
  const ids = new Set<string>()
  for (const phase of ['light', 'dark', 'restored'] as const) {
    const receipt = receipts[phase]
    if (receipt?.runId !== runId || !/^color-scheme-[1-9]\d*$/.test(receipt.requestId) || ids.has(receipt.requestId)
      || receipt.scheme !== (phase === 'dark' ? 'dark' : 'light')) {
      throw new Error('颜色模式切换或恢复回执身份无效')
    }
    ids.add(receipt.requestId)
  }
}
