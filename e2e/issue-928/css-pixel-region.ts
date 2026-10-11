import { PNG } from 'pngjs'

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

/** 按运行时 CSS 坐标采样截图，不按旧基线尺寸拉伸当前页面。 */
export function cropCssPixelRegion(source: PNG, viewportWidth: number, rect: Rect, options: { requireIntegerScale?: boolean } = {}) {
  if (![viewportWidth, rect.width, rect.height].every(value => Number.isFinite(value) && value > 0)
    || ![rect.left, rect.top].every(value => Number.isFinite(value) && value >= 0)) {
    throw new Error('截图裁剪需要有效的 CSS 视口和区域尺寸。')
  }
  const scale = source.width / viewportWidth
  if (options.requireIntegerScale && (!Number.isInteger(scale) || scale < 1)) {
    throw new Error(`像素基线需要整数截图采样比例，实际为 ${source.width}/${viewportWidth}=${scale}。请在当前项目的微信模拟器菜单选择「显示比例 → 100%」，保留足够窗口空间后重新截图；不得更新基线绕过。`)
  }
  const left = Math.floor(rect.left)
  const top = Math.floor(rect.top)
  const right = Math.ceil(rect.left + rect.width)
  const bottom = Math.ceil(rect.top + rect.height)
  if (right > viewportWidth || bottom * scale > source.height + 1) {
    throw new Error('CSS 对照区域超出本轮截图视口。')
  }
  const result = new PNG({ width: right - left, height: bottom - top })
  for (let y = 0; y < result.height; y++) {
    const sourceY = Math.min(source.height - 1, Math.floor((top + y + 0.5) * scale))
    for (let x = 0; x < result.width; x++) {
      const sourceX = Math.min(source.width - 1, Math.floor((left + x + 0.5) * scale))
      const from = (sourceY * source.width + sourceX) * 4
      source.data.copy(result.data, (y * result.width + x) * 4, from, from + 4)
    }
  }
  return result
}
