import type { NativeScreenMetrics } from '../../examples/react-lynx/src/compatibility/fixed-size-contract'
import type { PNG } from './png'
import { fixedSizeContract as contract } from '../../examples/react-lynx/src/compatibility/fixed-size-contract'

/** 独立固定的颜色和位置验证两张实际 PNG，防止报告和侧车同时改写坐标。 */
export function validateFixedSizePixels(images: readonly PNG[], screen: NativeScreenMetrics) {
  if (images.length !== 2) {
    throw new Error('固定尺寸截图缺少完整 probe/control')
  }
  const scale = screen.pixelRatio
  for (const [index, image] of images.entries()) {
    if (Math.abs(image.width - contract.container.width * scale) > 2 || Math.abs(image.height - contract.container.height * scale) > 2) {
      throw new Error('固定尺寸截图画布与宿主比例不符')
    }
    const width = index === 0 ? contract.width : contract.control.width
    const height = index === 0 ? contract.heightRpx * screen.width / contract.rpxRatio : contract.control.height
    const body = { left: contract.offset, top: contract.offset, right: contract.offset + width, bottom: contract.offset + height }
    const marker = { left: contract.offset + contract.marker.offset, top: contract.offset + contract.marker.offset, right: contract.offset + contract.marker.offset + contract.marker.size, bottom: contract.offset + contract.marker.offset + contract.marker.size }
    const near = (x: number, y: number, rect: typeof body) => x >= rect.left - 1 / scale && x <= rect.right + 1 / scale
      && y >= rect.top - 1 / scale && y <= rect.bottom + 1 / scale
      && [Math.abs(x - rect.left), Math.abs(x - rect.right), Math.abs(y - rect.top), Math.abs(y - rect.bottom)].some(value => value <= 1 / scale)
    const inside = (x: number, y: number, rect: typeof body) => x > rect.left && x < rect.right && y > rect.top && y < rect.bottom
    const checked = { body: 0, marker: 0, background: 0 }
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const cssX = (x + 0.5) / scale
        const cssY = (y + 0.5) / scale
        if (near(cssX, cssY, body) || near(cssX, cssY, marker)) {
          continue
        }
        const region = inside(cssX, cssY, marker) ? 'marker' : inside(cssX, cssY, body) ? 'body' : 'background'
        const offset = (y * image.width + x) * 4
        if (image.data[offset + 3] !== 255 || contract.colors[region].some((value, channel) => Math.abs(image.data[offset + channel]! - value) > 2)) {
          throw new Error(`固定尺寸截图与独立 ${region} 预期不符：${index}/${x},${y}`)
        }
        checked[region]++
      }
    }
    if (Object.values(checked).includes(0)) {
      throw new Error('固定尺寸截图缺少可验证的主体、标记或背景')
    }
  }
}
