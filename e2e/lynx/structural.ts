import type { NativeCaseResult } from '../../examples/react-lynx/src/compatibility/types'
import type { PngPixels } from './png'

const canvas = [247, 250, 251]
const ink = [19, 32, 38]
const delta = canvas.map((channel, index) => ink[index]! - channel)
const magnitude = delta.reduce((sum, channel) => sum + channel ** 2, 0)

function inspect(image: PngPixels) {
  const scale = image.width / 160
  const rows = Array.from({ length: 3 }, () => ({ pixels: new Map<number, number>(), mass: 0, core: 0, valid: true }))
  let outside = true
  for (let index = 0; index < image.width * image.height; index++) {
    if (image.data[index * 4 + 3] !== 255) {
      throw new Error('结构选择器缺少不透明画布')
    }
    const x = (index % image.width + 0.5) / scale
    const y = (Math.floor(index / image.width) + 0.5) / scale
    const color = [...image.data.subarray(index * 4, index * 4 + 3)]
    const alpha = delta.reduce((sum, channel, i) => sum + channel * (color[i]! - canvas[i]!), 0) / magnitude
    const row = Math.floor((y - 20) / 40)
    const inText = x >= 24 && x <= 136 && row >= 0 && row < 3 && (y - 20) % 40 >= 2 && (y - 20) % 40 <= 38
    if (!inText) {
      outside &&= color.every((channel, i) => Math.abs(channel - canvas[i]!) <= 2)
      continue
    }
    const target = rows[row]!
    target.valid &&= alpha >= -0.01 && alpha <= 1.01
      && color.every((channel, i) => Math.abs(channel - canvas[i]! - delta[i]! * alpha) <= 6)
    if (alpha > 0.02) {
      target.pixels.set(index, alpha)
      target.mass += alpha
      if (alpha >= 0.95) {
        target.core++
      }
    }
  }
  return { rows, outside }
}

function matches(first: Map<number, number>, second: Map<number, number>, width: number, offset = 0, alphaFactor = 1) {
  let matched = 0
  for (const [index, value] of first) {
    const translated = index + offset
    const x = translated % width
    let found = false
    // 仅容许一物理像素的裁剪或字形取整偏移，不平移或缩放原图。
    for (let row = -1; row <= 1; row++) {
      for (let column = -1; column <= 1; column++) {
        if (x + column >= 0 && x + column < width
          && Math.abs((second.get(translated + row * width + column) ?? 0) - value * alphaFactor) <= 0.045) {
          found = true
        }
      }
    }
    matched += Number(found)
  }
  return first.size > 0 ? matched / first.size : 0
}

function sameBoldGlyph(normal: Map<number, number>, bold: Map<number, number>, width: number) {
  const scale = width / 160
  const masks = [new Set([...normal].filter(([, alpha]) => alpha >= 0.15).map(([index]) => index)), new Set([...bold].filter(([, alpha]) => alpha >= 0.075).map(([index]) => index))]
  const boxes = masks.map((mask) => {
    const xs = [...mask].map(index => index % width)
    const ys = [...mask].map(index => Math.floor(index / width))
    return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) }
  })
  const [plain, thick] = boxes
  if (!plain || !thick || !masks.every(mask => mask.size > 0)
    || Math.abs(plain.left + plain.right - thick.left - thick.right) > 3 * scale
    || Math.abs(plain.top + plain.bottom - thick.top - thick.bottom) > 3 * scale
    || Math.abs((thick.right - thick.left + 1) / (plain.right - plain.left + 1) - 1) > 0.2
    || Math.abs((thick.bottom - thick.top + 1) / (plain.bottom - plain.top + 1) - 1) > 0.2) {
    return false
  }
  const normalArea = (plain.right - plain.left + 1) * (plain.bottom - plain.top + 1)
  const boldArea = (thick.right - thick.left + 1) * (thick.bottom - thick.top + 1)
  const normalMass = [...normal.values()].reduce((sum, alpha) => sum + alpha, 0)
  const boldMass = [...bold.values()].reduce((sum, alpha) => sum + alpha, 0)
  // 校正半透明后比较单位字形面积的笔画密度；字号缩放只能扩大面积，不能替代真实增粗。
  if (boldMass * 2 / boldArea / (normalMass / normalArea) < 1.15) {
    return false
  }
  // 粗细字体的实际字高可能不同；同时约束轮廓邻域，不将浏览器字体差异误当作缩放。
  const radius = Math.ceil(2 * scale)
  const matches = masks.map((source, index) => {
    const target = masks[1 - index]!
    let matched = 0
    for (const pixel of source) {
      const x = pixel % width
      let found = false
      for (let row = -radius; row <= radius && !found; row++) {
        for (let column = -radius; column <= radius && !found; column++) {
          found = x + column >= 0 && x + column < width && target.has(pixel + row * width + column)
        }
      }
      matched += Number(found)
    }
    return matched / source.size
  })
  // CoreText 粗体会在普通字形外侧增加真实笔画，新增像素无法反向匹配到普通字形；
  // 保持普通字形全部落在粗体轮廓内，同时给粗体反向匹配保留原生字体的增厚余量。
  return matches[0]! >= 0.97 && matches[1]! >= 0.9
}

/** 三帧分别提供被测选择器、普通文字和显式效果；所有兄弟位置必须与显式效果一致。 */
export function evaluateStructural(images: PngPixels[]): NativeCaseResult {
  const [probe, control, reference] = images
  if (images.length !== 3 || !probe || images.some(image => image.width < 160 || image.width !== image.height || image.width !== probe.width)) {
    throw new Error('结构选择器缺少三张等尺寸完整画布')
  }
  const scale = probe.width / 160
  const plain = inspect(control!)
  const expected = inspect(reference!)
  if (!plain.outside || !expected.outside || plain.rows.some(row => !row.valid || row.core < 20 * scale ** 2)) {
    throw new Error('结构选择器普通文字或画布对照无效')
  }
  const first = plain.rows[0]!
  for (const [index, row] of plain.rows.entries()) {
    const offset = Math.round(index * 40 * scale) * probe.width
    if (Math.abs(row.mass / first.mass - 1) > 0.06
      || matches(first.pixels, row.pixels, probe.width, offset) < 0.97
      || matches(row.pixels, first.pixels, probe.width, -offset) < 0.97) {
      throw new Error('结构选择器普通文字三个兄弟字形不一致')
    }
  }
  for (const [index, row] of expected.rows.entries()) {
    const normal = plain.rows[index]!
    const ratio = row.mass / normal.mass
    const peak = Math.max(0, ...row.pixels.values())
    const valid = row.valid && (index === 0
      ? ratio >= 0.56 && ratio <= 1.2 && peak >= 0.49 && peak <= 0.52 && sameBoldGlyph(normal.pixels, row.pixels, probe.width)
      : Math.abs(ratio - (index === 1 ? 1 : 0.5)) <= 0.03
        && matches(normal.pixels, row.pixels, probe.width, 0, index === 1 ? 1 : 0.5) >= 0.97
        && matches(row.pixels, normal.pixels, probe.width, 0, index === 1 ? 1 : 2) >= 0.97)
    if (!valid) {
      throw new Error('结构选择器显式粗体或透明度对照无效')
    }
  }
  const actual = inspect(probe)
  const observations = actual.rows.map((row, index) => {
    const target = expected.rows[index]!
    return {
      massRatio: row.mass / target.mass,
      forward: matches(row.pixels, target.pixels, probe.width),
      reverse: matches(target.pixels, row.pixels, probe.width),
      valid: row.valid,
    }
  })
  const passed = actual.outside && observations.every(row => row.valid && Math.abs(row.massRatio - 1) <= 0.04 && row.forward >= 0.97 && row.reverse >= 0.97)
  return {
    id: 'variant-structural',
    status: passed ? 'supported' : 'unsupported',
    ...(passed ? {} : { reason: '结构选择器未在首项、偶数项和第三项同时呈现预期粗体与透明度', failureStage: 'runtime' as const }),
    checkpoints: [{ name: 'pixel:structural-v1', passed, actual: JSON.stringify({ outside: actual.outside, rows: observations }), expected: '三个兄弟依次为粗体/0.5、普通/1、普通/0.5，与显式效果及普通文字对照一致' }],
  }
}
