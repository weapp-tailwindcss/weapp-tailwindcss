import type { PNG } from 'pngjs'

export interface MarkerColor { red: number, green: number, blue: number }
export interface MarkerBounds { minX: number, minY: number, maxX: number, maxY: number }

function matches(image: PNG, pixel: number, color: MarkerColor) {
  const offset = pixel * 4
  return image.data[offset + 3]! >= 8
    && Math.abs(image.data[offset]! - color.red) <= 4
    && Math.abs(image.data[offset + 1]! - color.green) <= 4
    && Math.abs(image.data[offset + 2]! - color.blue) <= 4
}

/** 按连通区域定位标记，禁止将页面中无关的同色块并入标记边界。 */
export function locateMarkerColor(image: PNG, color: MarkerColor, markerClass: string) {
  const width = Number(markerClass.match(/\bw-\[([\d.]+)px\]/)?.[1])
  const height = Number(markerClass.match(/\bh-\[([\d.]+)px\]/)?.[1])
  const expectedRatio = width && height ? width / height : undefined
  const visited = new Uint8Array(image.width * image.height)
  const queue = new Int32Array(visited.length)
  const candidates: Array<{ bounds: MarkerBounds, matchingPixels: number }> = []
  for (let pixel = 0; pixel < visited.length; pixel++) {
    if (visited[pixel] || !matches(image, pixel, color)) {
      continue
    }
    let head = 0
    let tail = 1
    queue[0] = pixel
    visited[pixel] = 1
    const bounds = { minX: image.width, minY: image.height, maxX: -1, maxY: -1 }
    while (head < tail) {
      const current = queue[head++]!
      const x = current % image.width
      const y = Math.floor(current / image.width)
      bounds.minX = Math.min(bounds.minX, x)
      bounds.maxX = Math.max(bounds.maxX, x)
      bounds.minY = Math.min(bounds.minY, y)
      bounds.maxY = Math.max(bounds.maxY, y)
      const neighbors = [
        x > 0 ? current - 1 : -1,
        x + 1 < image.width ? current + 1 : -1,
        y > 0 ? current - image.width : -1,
        y + 1 < image.height ? current + image.width : -1,
      ]
      for (const next of neighbors) {
        if (next >= 0 && !visited[next] && matches(image, next, color)) {
          visited[next] = 1
          queue[tail++] = next
        }
      }
    }
    const ratio = (bounds.maxX - bounds.minX + 1) / (bounds.maxY - bounds.minY + 1)
    if (tail > 100 && (!expectedRatio || Math.abs(ratio / expectedRatio - 1) < 0.2)) {
      candidates.push({ bounds, matchingPixels: tail })
    }
  }
  // 文字轮廓可能隔出同色小区域；已被另一候选完整包围的区域不构成独立标记。
  const regions = candidates.filter(candidate => !candidates.some(parent =>
    parent !== candidate
    && parent.bounds.minX <= candidate.bounds.minX
    && parent.bounds.minY <= candidate.bounds.minY
    && parent.bounds.maxX >= candidate.bounds.maxX
    && parent.bounds.maxY >= candidate.bounds.maxY
    && (parent.bounds.maxX - parent.bounds.minX) * (parent.bounds.maxY - parent.bounds.minY)
    > (candidate.bounds.maxX - candidate.bounds.minX) * (candidate.bounds.maxY - candidate.bounds.minY),
  ))
  // 缺少几何约束时取主要区域；多个独立同形标记则拒绝猜测。
  regions.sort((a, b) => b.matchingPixels - a.matchingPixels)
  const marker = expectedRatio && regions.length !== 1 ? undefined : regions[0]
  return { bounds: marker?.bounds, color, matched: !!marker, matchingPixels: marker?.matchingPixels ?? 0, candidateCount: regions.length }
}

/** 同色 HMR 比较标记区域的位置与形状变化，排除状态栏时钟等页面噪声。 */
export function countMarkerPixelChanges(before: PNG, after: PNG, color: MarkerColor, beforeBounds: MarkerBounds, afterBounds: MarkerBounds) {
  if (before.width !== after.width || before.height !== after.height) {
    throw new Error('HMR 前后截图尺寸不一致')
  }
  let changed = 0
  for (let y = Math.min(beforeBounds.minY, afterBounds.minY); y <= Math.max(beforeBounds.maxY, afterBounds.maxY); y++) {
    for (let x = Math.min(beforeBounds.minX, afterBounds.minX); x <= Math.max(beforeBounds.maxX, afterBounds.maxX); x++) {
      const pixel = y * before.width + x
      if (matches(before, pixel, color) !== matches(after, pixel, color)) {
        changed++
      }
    }
  }
  return changed
}
