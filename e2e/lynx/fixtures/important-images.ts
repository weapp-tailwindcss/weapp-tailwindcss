import { PNG } from '../png'

/** 只供协议回归使用的合成图，颜色与尺寸独立固定，不能冒充设备 PNG。 */
export function importantImage(scale = 1, color: 'gray' | 'red' | 'blue' = 'gray') {
  const image = new PNG({ width: 160 * scale, height: 160 * scale })
  const target = color === 'gray' ? [115, 115, 115, 255] : color === 'red' ? [220, 38, 38, 255] : [14, 165, 233, 255]
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      image.data.set(x >= 12 * scale && x < 108 * scale && y >= 12 * scale && y < 76 * scale ? target : [247, 250, 251, 255], (y * image.width + x) * 4)
    }
  }
  return image
}
