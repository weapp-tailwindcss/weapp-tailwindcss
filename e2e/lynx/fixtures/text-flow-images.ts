import { PNG } from '../png'

type Kind = 'expected' | 'control' | 'top' | 'collapsed' | 'nowrap' | 'empty' | 'shifted' | 'shifted-down' | 'uneven'

/** 仅用于协议反例的合成字形，不作为原生运行证据。 */
export function textFlowImage(scale = 1, kind: Kind = 'expected') {
  const image = new PNG({ width: 160 * scale, height: 160 * scale })
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const px = (x + 0.5) / scale
      const py = (y + 0.5) / scale
      const glyph = (left: number, top: number, width = 12, height = 14) => {
        const u = (px - left) / width
        const v = (py - top) / height
        return u >= 0 && u < 1 && v >= 0 && v < 1 && (Math.abs(u - v) < 0.2 || Math.abs(u + v - 1) < 0.2)
      }
      const markerTop = kind === 'control' || kind === 'top' ? 12 : 30
      let color = [247, 250, 251]
      if (kind !== 'empty') {
        if (glyph(12, 20, 24, 28)) {
          color = [19, 32, 38]
        }
        if (px >= 42 && px < 52 && py >= markerTop && py < markerTop + 10) {
          color = [14, 165, 233]
        }
        const rows = [[12, kind === 'collapsed' ? 30 : 36], kind === 'uneven' ? [12, 27, 51, 66] : [12, 30, 48, 66], [12, 30]]
        if (kind === 'control' || kind === 'nowrap') {
          rows.splice(1)
        }
        if (rows.some((positions, row) => positions.some(left => glyph(left + (kind === 'shifted' ? 4 : 0), 76 + row * 24 + (kind === 'shifted-down' ? 4 : 0))))) {
          color = [19, 32, 38]
        }
      }
      image.data.set([...color, 255], (y * image.width + x) * 4)
    }
  }
  return image
}
