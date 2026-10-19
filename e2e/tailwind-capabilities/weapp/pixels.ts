import type { PNG } from 'pngjs'

/** 视口裁剪图按实际宽度换算采样，不把设备 pixelRatio 当成宿主截图比例。 */
export function sampleWeappPixel(image: PNG, viewportWidth: number, rect: { left: number, top: number, width: number, height: number }) {
  const scale = image.width / viewportWidth
  const x = Math.floor((rect.left + rect.width * 0.85) * scale)
  const y = Math.floor((rect.top + rect.height * 0.85) * scale)
  if (!Number.isFinite(scale) || scale <= 0 || rect.width <= 0 || rect.height <= 0 || x < 0 || y < 0 || x >= image.width || y >= image.height) {
    throw new Error('微信像素采样超出实际视口截图')
  }
  const offset = (y * image.width + x) * 4
  return [image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!, image.data[offset + 3]!]
}
