import { PNG } from '../png'

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, right: left + width, bottom: top + height, width, height })

/** 合成数据仅检验裁剪判定器，固定数字独立于被测合同，不代表设备结果。 */
export function overflowGeometry() {
  return {
    probeContainer: rect(20, 100, 160, 160), controlContainer: rect(20, 300, 160, 160),
    probe: rect(32, 112, 96, 64), control: rect(32, 312, 96, 64),
    probeChild: rect(104, 152, 48, 40), controlChild: rect(104, 352, 48, 40),
  }
}

export function overflowImage(clipped: boolean, scale = 1) {
  const image = new PNG({ width: 160 * scale, height: 160 * scale })
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const parent = x >= 12 * scale && x < 108 * scale && y >= 12 * scale && y < 76 * scale
      const child = x >= 84 * scale && x < 132 * scale && y >= 52 * scale && y < 92 * scale
      const color = child && (!clipped || parent) ? [250, 204, 21, 255] : parent ? [14, 165, 233, 255] : [247, 250, 251, 255]
      image.data.set(color, (y * image.width + x) * 4)
    }
  }
  return image
}
