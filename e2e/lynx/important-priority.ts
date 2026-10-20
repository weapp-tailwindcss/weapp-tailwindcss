import type { NativeCaseResult } from '../../examples/react-lynx/src/compatibility/types'
import type { PngPixels } from './png'
import { importantPriorityContract as contract } from '../../examples/react-lynx/src/compatibility/important-priority-contract'

function rgb(hex: string) {
  return [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16))
}

function inspect(image: PngPixels) {
  const colors = { expected: rgb(contract.expected), competitor: rgb(contract.competitor), canvas: rgb(contract.canvas) }
  const scale = image.width / contract.frameSize
  const counts = { expected: 0, competitor: 0, target: 0 }
  const target = contract.target
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const px = (x + 0.5) / scale
      const py = (y + 0.5) / scale
      // 一物理像素的边缘不参与颜色判定，主体和外部区域均逐像素验真。
      const inside = px >= target.x + 1 / scale && px < target.x + target.width - 1 / scale
        && py >= target.y + 1 / scale && py < target.y + target.height - 1 / scale
      const outside = px < target.x - 1 / scale || px >= target.x + target.width + 1 / scale
        || py < target.y - 1 / scale || py >= target.y + target.height + 1 / scale
      if (!inside && !outside) {
        continue
      }
      const offset = (y * image.width + x) * 4
      if (image.data[offset + 3] !== 255) {
        throw new Error('important 优先级缺少不透明固定画布')
      }
      const matches = (color: number[]) => color.every((channel, index) => Math.abs(image.data[offset + index]! - channel) <= contract.colorTolerance)
      if (outside) {
        if (!matches(colors.canvas)) {
          throw new Error('important 优先级的主体尺寸或外部画布无效')
        }
        continue
      }
      counts.target++
      counts.expected += Number(matches(colors.expected))
      counts.competitor += Number(matches(colors.competitor))
    }
  }
  return { expected: counts.expected === counts.target, competitor: counts.competitor === counts.target }
}

/** 普通竞争组必须为红，参考必须为灰；只有完整灰色 probe 才证明 important 胜过普通 ID。 */
export function evaluateImportantPriority(images: PngPixels[]): NativeCaseResult {
  const [probe, control, reference] = images
  if (images.length !== contract.frames.length || !probe || images.some(image => image.width < contract.frameSize || image.width !== image.height || image.width !== probe.width)) {
    throw new Error('important 优先级缺少三张等尺寸完整画布')
  }
  const ordinary = inspect(control!)
  const fixed = inspect(reference!)
  if (!ordinary.competitor || !fixed.expected) {
    throw new Error('important 优先级的普通竞争规则或独立实色参考无效')
  }
  const actual = inspect(probe)
  if (!actual.expected && !actual.competitor) {
    throw new Error('important probe 既非预期灰色也非竞争红色，不能据此推断支持状态')
  }
  return {
    id: contract.id,
    status: actual.expected ? 'supported' : 'unsupported',
    ...(actual.expected ? {} : { reason: 'important 未胜过同节点的普通 ID 背景声明，probe 与普通竞争组均呈红色', failureStage: 'runtime' as const }),
    checkpoints: [{ name: contract.checkpoint, passed: actual.expected, actual: JSON.stringify({ probe: actual.expected ? contract.expected : contract.competitor, control: contract.competitor, reference: contract.expected }), expected: 'important probe 为灰，普通 utility 在相同 ID 竞争下为红，独立参考为灰' }],
  }
}
