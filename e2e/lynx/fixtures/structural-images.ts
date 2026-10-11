import { PNG } from '../png'

type Kind = 'expected' | 'plain' | 'missing-first' | 'missing-odd' | 'unconditional' | 'red' | 'shifted' | 'empty'

/** 仅验证像素协议的合成笔画，不作为原生 SDK 字体证据。 */
export function structuralImage(scale = 1, kind: Kind = 'expected') {
  const image = new PNG({ width: Math.round(160 * scale), height: Math.round(160 * scale) })
  for (let index = 0; index < image.width * image.height; index++) {
    const x = (index % image.width + 0.5) / scale - (kind === 'shifted' ? 8 : 0)
    const y = (Math.floor(index / image.width) + 0.5) / scale
    const row = Math.floor((y - 20) / 40)
    const localY = (y - 20) % 40
    const bold = kind === 'unconditional' || (row === 0 && kind !== 'plain' && kind !== 'missing-first')
    const half = kind === 'unconditional' || (row !== 1 && kind !== 'plain' && kind !== 'missing-odd')
    const thickness = bold ? 6 : 4
    const glyph = kind !== 'empty' && row >= 0 && row < 3 && localY >= 8 && localY < 32
      && ((x >= 54 && x < 54 + thickness) || (x >= 72 && x < 72 + thickness) || (x >= 90 && x < 90 + thickness) || (localY < 8 + thickness && x >= 54 && x < 106))
    const canvas = [247, 250, 251]
    const ink = kind === 'red' ? [255, 0, 0] : [19, 32, 38]
    const color = glyph ? canvas.map((channel, i) => Math.round(channel + (ink[i]! - channel) * (half ? 0.5 : 1))) : canvas
    image.data.set([...color, 255], index * 4)
  }
  return image
}
