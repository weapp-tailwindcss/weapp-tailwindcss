import type { NativeCaseResult, NativeGeometryEvidence, NativeRect } from '../../examples/react-lynx/src/compatibility/types'
import type { PngPixels } from './png'
import { validNativeGeometry } from '../../examples/react-lynx/src/compatibility/native-geometry'
import { overflowContract as contract } from '../../examples/react-lynx/src/compatibility/overflow-contract'

function relative(rect: NativeRect, parent: NativeRect) {
  return { x: rect.left - parent.left, y: rect.top - parent.top, width: rect.width, height: rect.height }
}

/** 两组均须具有相同、未被裁短的真实越界子项；尺寸漂移不能替代裁剪效果。 */
export function assertOverflowGeometry(geometry: NativeGeometryEvidence) {
  if (!validNativeGeometry(geometry)) {
    throw new Error('overflow 缺少完整独立原生矩形')
  }
  for (const frame of ['probe', 'control'] as const) {
    const container = geometry[`${frame}Container`]
    const parent = geometry[frame]
    const child = geometry[`${frame}Child`]
    const actual = [container.width, container.height, ...Object.values(relative(parent, container)), ...Object.values(relative(child, parent))]
    const expected = [contract.frameSize, contract.frameSize, ...Object.values(contract.parent), ...Object.values(contract.child)]
    if (actual.some((value, index) => Math.abs(value - expected[index]!) > contract.geometryTolerance)) {
      throw new Error(`overflow ${frame} 的固定父/子几何无效，不能形成越界裁剪对照`)
    }
    if (child.right <= parent.right + 20 || child.bottom <= parent.bottom + 12
      || child.right >= container.right || child.bottom >= container.bottom) {
      throw new Error(`overflow ${frame} 子项没有在完整画布内真实越界`)
    }
  }
}

function rgb(hex: string) {
  return [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16))
}

function inspect(image: PngPixels) {
  const scale = image.width / contract.frameSize
  const parent = contract.parent
  const child = { ...contract.child, x: parent.x + contract.child.x, y: parent.y + contract.child.y }
  const colors = Object.fromEntries(Object.entries(contract.colors).map(([name, value]) => [name, rgb(value)]))
  const edges = [parent.x, parent.x + parent.width, child.x, child.x + child.width]
  const horizontalEdges = [parent.y, parent.y + parent.height, child.y, child.y + child.height]
  const counts = { outside: 0, hidden: 0, visible: 0 }
  const contains = (x: number, y: number, rect: typeof parent | typeof child) => x > rect.x && x < rect.x + rect.width && y > rect.y && y < rect.y + rect.height
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const px = (x + 0.5) / scale
      const py = (y + 0.5) / scale
      // 截图原点可落在分数物理像素；最多丢弃各几何边缘的一物理像素，不移动或缩放截图。
      if (edges.some(edge => Math.abs(px - edge) <= 1 / scale) || horizontalEdges.some(edge => Math.abs(py - edge) <= 1 / scale)) {
        continue
      }
      const offset = (y * image.width + x) * 4
      if (image.data[offset + 3] !== 255) {
        throw new Error('overflow 缺少不透明完整画布')
      }
      const matches = (name: string) => colors[name]!.every((value, channel) => Math.abs(image.data[offset + channel]! - value) <= contract.colorTolerance)
      const inParent = contains(px, py, parent)
      const inChild = contains(px, py, child)
      if (inChild && !inParent) {
        counts.outside++
        counts.hidden += Number(matches('canvas'))
        counts.visible += Number(matches('child'))
      }
      else if (!matches(inChild ? 'child' : inParent ? 'parent' : 'canvas')) {
        throw new Error('overflow 的固定主体、子项交集或外部画布像素无效')
      }
    }
  }
  if (counts.outside < 100 || (counts.hidden !== counts.outside && counts.visible !== counts.outside)) {
    throw new Error('overflow 越界区域不是完整隐藏或完整显示，不能推断支持状态')
  }
  return { ...counts, clipped: counts.hidden === counts.outside }
}

/** control 必须完整显示右侧及底部越界区域，probe 必须仅显示父/子交集才能证明 hidden。 */
export function evaluateOverflow(geometry: NativeGeometryEvidence, probe: PngPixels, control: PngPixels): NativeCaseResult {
  assertOverflowGeometry(geometry)
  if (probe.width < contract.frameSize || probe.width !== probe.height || control.width !== probe.width || control.height !== probe.height) {
    throw new Error('overflow 缺少两张等尺寸的完整固定画布')
  }
  const plain = inspect(control)
  if (plain.clipped) {
    throw new Error('overflow control 没有完整显示真实越界子项，不能归因于被测 utility')
  }
  const styled = inspect(probe)
  return {
    id: contract.id,
    status: styled.clipped ? 'supported' : 'unsupported',
    ...(styled.clipped ? {} : { reason: '原生父框没有裁剪右侧及底部越界子项，probe 与 visible control 一样完整显示', failureStage: 'runtime' as const }),
    geometry,
    checkpoints: [{ name: contract.checkpoint, passed: styled.clipped, actual: JSON.stringify({ probe: styled, control: plain }), expected: '相同真实越界几何；control 完整显示，hidden probe 仅显示父/子 24×24px 交集，外侧为画布' }],
  }
}
