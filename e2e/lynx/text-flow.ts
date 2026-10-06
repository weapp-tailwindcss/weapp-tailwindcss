import type { NativeCaseResult } from '../../examples/react-lynx/src/compatibility/types'
import type { PngPixels } from './png'

interface Box { left: number, right: number, top: number, bottom: number }
const canvas = [247, 250, 251]
const ink = [19, 32, 38]
const markerColor = [14, 165, 233]

function bounds(pixels: Set<number>, width: number, scale: number): Box | undefined {
  if (!pixels.size) {
    return undefined
  }
  const xs = [...pixels].map(index => index % width / scale)
  const ys = [...pixels].map(index => Math.floor(index / width) / scale)
  return { left: Math.min(...xs), right: Math.max(...xs) + 1 / scale, top: Math.min(...ys), bottom: Math.max(...ys) + 1 / scale }
}

function inspect(image: PngPixels) {
  const scale = image.width / 160
  const marker = new Set<number>()
  const anchor = new Set<number>()
  const text = new Set<number>()
  let valid = true
  for (let index = 0; index < image.width * image.height; index++) {
    if (image.data[index * 4 + 3] !== 255) {
      throw new Error('文字流缺少不透明画布')
    }
    const color = [...image.data.subarray(index * 4, index * 4 + 3)]
    const alpha = (canvas[0]! - color[0]!) / (canvas[0]! - ink[0]!)
    const y = (Math.floor(index / image.width) + 0.5) / scale
    if (color.every((channel, i) => Math.abs(channel - markerColor[i]!) <= 3)) {
      if (y < 64) {
        marker.add(index)
      }
      else {
        valid = false
      }
    }
    else if (color.every((channel, i) => Math.abs(channel - canvas[i]! - alpha * (ink[i]! - canvas[i]!)) <= 6)) {
      if (alpha > 0.2) {
        (y < 64 ? anchor : text).add(index)
      }
    }
    else {
      // 只容许彩色标记轮廓上的抗锯齿，不容许整块无关颜色替代文字。
      const markerAlpha = (canvas[0]! - color[0]!) / (canvas[0]! - markerColor[0]!)
      valid &&= y < 64 && color.every((channel, i) => Math.abs(channel - canvas[i]! - markerAlpha * (markerColor[i]! - canvas[i]!)) <= 6)
    }
  }
  return { marker: bounds(marker, image.width, scale), markerPixels: marker.size, anchor, text, valid }
}

function matches(first: Set<number>, second: Set<number>, width: number) {
  let matched = 0
  for (const index of first) {
    const x = index % width
    let found = false
    for (let y = -1; y <= 1 && !found; y++) {
      for (let dx = -1; dx <= 1 && !found; dx++) {
        found = x + dx >= 0 && x + dx < width && second.has(index + y * width + dx)
      }
    }
    matched += Number(found)
  }
  return first.size > 0 ? matched / first.size : 0
}

function sameText(first: Set<number>, second: Set<number>, width: number) {
  return first.size > 0 && Math.abs(second.size / first.size - 1) <= 0.08
    && matches(first, second, width) >= 0.97 && matches(second, first, width) >= 0.97
}

function groups(values: number[]) {
  const result: number[][] = []
  for (const value of [...new Set(values)].sort((a, b) => a - b)) {
    const last = result.at(-1)
    if (!last || value > last.at(-1)! + 1) {
      result.push([value])
    }
    else {
      last.push(value)
    }
  }
  return result
}

function lines(pixels: Set<number>, width: number, scale: number) {
  return groups([...pixels].map(index => Math.floor(index / width))).map((rows) => {
    const rowSet = new Set(rows)
    const glyphs = groups([...pixels].filter(index => rowSet.has(Math.floor(index / width))).map(index => index % width))
    return { top: rows[0]! / scale, bottom: (rows.at(-1)! + 1) / scale, glyphs: glyphs.map(xs => ({ left: xs[0]! / scale, right: (xs.at(-1)! + 1) / scale })) }
  })
}

/** 独立手工分行不依赖 pre-wrap；必须同时出现双空格、硬换行、软换行和行内垂直对齐。 */
export function evaluateTextFlow(images: PngPixels[]): NativeCaseResult {
  const [probe, control, reference] = images
  if (images.length !== 3 || !probe || images.some(image => image.width < 160 || image.width !== image.height || image.width !== probe.width)) {
    throw new Error('文字流缺少三张等尺寸完整画布')
  }
  const scale = probe.width / 160
  const actual = inspect(probe)
  const plain = inspect(control!)
  const expected = inspect(reference!)
  const referenceLines = lines(expected.text, probe.width, scale)
  const plainLines = lines(plain.text, probe.width, scale)
  const validMarker = (value: ReturnType<typeof inspect>) => value.marker
    && Math.abs(value.marker.right - value.marker.left - 10) <= 1.5
    && Math.abs(value.marker.bottom - value.marker.top - 10) <= 1.5
    && value.markerPixels >= 70 * scale ** 2
  if (!plain.valid || !expected.valid || !validMarker(plain) || !validMarker(expected)
    || !sameText(plain.anchor, expected.anchor, probe.width)
    || (plainLines[0]?.glyphs.length ?? 0) < 2
    || referenceLines.map(line => line.glyphs.length).join(',') !== '2,4,2') {
    throw new Error('文字流标记、锚文字或手工分行对照无效')
  }
  const [first, second, third] = referenceLines
  const plainFirst = plainLines[0]!
  const glyphPixels = (pixels: Set<number>, row: typeof plainFirst, glyph: typeof plainFirst.glyphs[number]) => new Set([...pixels].filter((index) => {
    const x = (index % probe.width + 0.5) / scale
    const y = (Math.floor(index / probe.width) + 0.5) / scale
    return x >= glyph.left && x < glyph.right && y >= row.top && y < row.bottom
  }))
  const anchorGlyph = glyphPixels(plain.text, plainFirst, plainFirst.glyphs[0]!)
  if (Math.abs(first!.top - plainFirst.top) > 1 / scale
    || Math.abs(first!.glyphs[0]!.left - plainFirst.glyphs[0]!.left) > 1 / scale
    || referenceLines.some(row => row.glyphs.some((glyph) => {
      const dx = Math.round((plainFirst.glyphs[0]!.left - glyph.left) * scale)
      const dy = Math.round((plainFirst.top - row.top) * scale)
      const normalized = new Set([...glyphPixels(expected.text, row, glyph)].map(index => index + dx + dy * probe.width))
      return !sameText(anchorGlyph, normalized, probe.width)
    }))) {
    throw new Error('文字流手工对照字形或原点与控制组不一致')
  }
  const gap = (row: typeof first) => row!.glyphs[1]!.left - row!.glyphs[0]!.right
  const advance = second!.glyphs[1]!.left - second!.glyphs[0]!.left
  const end = second!.glyphs[3]!.right - second!.glyphs[0]!.left
  const regularSpacing = [second!, third!].every(row => row.glyphs.slice(1).every((glyph, index) => (
    Math.abs(glyph.left - row.glyphs[index]!.left - advance) <= 1 / scale + 0.01
  )))
  if (Math.abs(second!.top - first!.top - 24) > 1 || Math.abs(third!.top - second!.top - 24) > 1
    || !regularSpacing
    || gap(first) < gap(third) * 1.3 || gap(third) < 2
    || end > 78 || end + advance <= 78
    || referenceLines.some(line => Math.abs(line.glyphs[0]!.left - first!.glyphs[0]!.left) > 1)) {
    throw new Error('文字流手工对照无法校准双空格或四字软换行边界')
  }
  const movement = expected.marker!.top - plain.marker!.top
  const aligned = actual.marker && validMarker(actual) && movement >= 8 && movement <= 28
    && Math.abs(expected.marker!.left - plain.marker!.left) <= 1.5
    && Math.abs(actual.marker.top - expected.marker!.top) <= 1.5
    && Math.abs(actual.marker.left - expected.marker!.left) <= 1.5
  const whitespace = sameText(expected.text, actual.text, probe.width)
  const passed = Boolean(actual.valid && aligned && whitespace && sameText(plain.anchor, actual.anchor, probe.width))
  return {
    id: 'type-flow',
    status: passed ? 'supported' : 'unsupported',
    ...(passed ? {} : { reason: '行内中部对齐、双空格保留、显式换行与软换行未同时满足', failureStage: 'runtime' as const }),
    checkpoints: [{ name: 'pixel:text-flow-v1', passed, actual: JSON.stringify({ aligned: Boolean(aligned), whitespace, movement, lines: lines(actual.text, probe.width, scale) }), expected: '行内标记由 top 移至 middle；文字与独立 2/4/2 字分行及双空格对照一致' }],
  }
}
