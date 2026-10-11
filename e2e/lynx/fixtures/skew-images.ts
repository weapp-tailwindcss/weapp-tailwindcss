import { PNG } from '../png'

type Transform = 'identity' | 'skew' | 'canvas' | 'translate' | 'scale' | 'rotate' | 'only-x' | 'only-y' | 'reverse' | 'wrong-angle'

/** 合成形状仅测试像素判定器，不作为原生验收证据。 */
export function skewImage(scale: number, transform: Transform = 'skew') {
  const image = new PNG({ width: Math.round(160 * scale), height: Math.round(160 * scale) })
  const x = Math.tan((transform === 'wrong-angle' ? 1 : 6) * Math.PI / 180)
  const y = Math.tan((transform === 'wrong-angle' ? 1 : 3) * Math.PI / 180)
  const angle = 6 * Math.PI / 180
  const matrices: Record<Transform, number[]> = {
    'identity': [1, 0, 0, 1],
    'skew': [1 + x * y, x, y, 1],
    'canvas': [1, x, y, 1],
    'translate': [1, 0, 0, 1],
    'scale': [1.1, 0, 0, 1.1],
    'rotate': [Math.cos(angle), -Math.sin(angle), Math.sin(angle), Math.cos(angle)],
    'only-x': [1, x, 0, 1],
    'only-y': [1, 0, y, 1],
    'reverse': [1 + x * y, -x, -y, 1],
    'wrong-angle': [1 + x * y, x, y, 1],
  }
  const [a, b, c, d] = matrices[transform] as [number, number, number, number]
  const vertices = [[-48, -40], [48, -40], [48, 40], [-48, 40]].map(([left, top]) => [
    80 + a * left! + b * top! + (transform === 'translate' ? 4 : transform === 'canvas' ? -48 * x * y : 0),
    80 + c * left! + d * top! + (transform === 'translate' ? 3 : transform === 'canvas' ? -40 * x * y : 0),
  ])
  for (let row = 0; row < image.height; row++) {
    for (let column = 0; column < image.width; column++) {
      const px = (column + 0.5) / scale
      const py = (row + 0.5) / scale
      const inside = vertices.every((first, index) => {
        const second = vertices[(index + 1) % vertices.length]!
        return (second[0]! - first[0]!) * (py - first[1]!) - (second[1]! - first[1]!) * (px - first[0]!) >= 0
      })
      image.data.set(inside ? [14, 165, 233, 255] : [247, 250, 251, 255], (row * image.width + column) * 4)
    }
  }
  return image
}
