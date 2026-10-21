import type { PNG } from 'pngjs'
import type { NativePairEvidence } from '../../examples/react-native-expo/src/compatibility/protocol'
import { nativeImageFixture as fixture } from '../../examples/react-native-expo/src/compatibility/image-fixture'

/** 原始事件、绝对尺寸与双色采样同时重算；同屏双方一起错误不能通过。 */
export function assessNativeImage(image: PNG, pair: NativePairEvidence) {
  const loads = pair.image?.loads
  const sides = ['probe', 'reference', 'control'] as const
  if (pair.image?.version !== 1 || !Array.isArray(loads) || loads.length !== 3
    || sides.some(side => loads.filter(load => load.side === side).length !== 1)
    || loads.some(load => load.revision !== pair.revision || load.id !== pair.id || load.phase !== pair.phase
      || load.event !== 'load' || load.origin !== (pair.platform === 'web' ? 'web-target' : 'native-source')
      || load.uri !== fixture.uri || load.width !== fixture.intrinsic.width || load.height !== fixture.intrinsic.height)) {
    throw new Error('Image 缺失当前阶段真实加载事件、解码尺寸或源 URI')
  }
  const targets = [pair.target, pair.referenceTarget, pair.controlTarget]
  const frames = [pair.probe, pair.reference, pair.control]
  const geometry = targets.map((rect, index) => {
    const expected = index === 2 ? fixture.control : fixture.display
    return Math.abs(rect.width - expected.width) <= 0.5 && Math.abs(rect.height - expected.height) <= 0.5
      && Math.abs(rect.x - frames[index]!.x - 16) <= 0.5 && Math.abs(rect.y - frames[index]!.y - 16) <= 0.5
  })
  const pixels = targets.map(rect => fixture.colors.every((color, half) => {
    // 四分点及上下角区取 3×3 实像素，避开插值边界。
    return [0.2, 0.5, 0.8].every(vertical => [0.2, 0.5, 0.8].every((horizontal) => {
      const x = Math.round((rect.x + rect.width * (half + horizontal) / 2) * pair.viewport.pixelRatio)
      const y = Math.round((rect.y + rect.height * vertical) * pair.viewport.pixelRatio)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (x + dx < 0 || y + dy < 0 || x + dx >= image.width || y + dy >= image.height) {
            return false
          }
          const offset = ((y + dy) * image.width + x + dx) * 4
          if (color.some((channel, index) => Math.abs(image.data[offset + index]! - channel) > 2)) {
            return false
          }
        }
      }
      return true
    }))
  }) && [0.2, 0.5, 0.8].every(fraction => [
    [rect.x - 2, rect.y + rect.height * fraction],
    [rect.x + rect.width + 2, rect.y + rect.height * fraction],
    [rect.x + rect.width * fraction, rect.y - 2],
    [rect.x + rect.width * fraction, rect.y + rect.height + 2],
  ].every(([x, y]) => {
    const px = Math.round(x! * pair.viewport.pixelRatio)
    const py = Math.round(y! * pair.viewport.pixelRatio)
    if (px < 0 || py < 0 || px >= image.width || py >= image.height) {
      return false
    }
    const offset = (py * image.width + px) * 4
    return [226, 232, 240, 255].every((channel, index) => Math.abs(image.data[offset + index]! - channel) <= 2)
  })))
  return { geometry, pixels }
}
