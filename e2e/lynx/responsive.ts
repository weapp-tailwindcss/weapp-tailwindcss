import type { ResponsiveFrame, ResponsivePhase } from '../../examples/react-lynx/src/compatibility/responsive-contract'
import type { NativeCaseResult } from '../../examples/react-lynx/src/compatibility/types'
import type { PngPixels } from './png'
import { responsiveContract as contract, validResponsiveFrame } from '../../examples/react-lynx/src/compatibility/responsive-contract'

export type ResponsiveFrames = Record<ResponsivePhase, ResponsiveFrame>
export type ResponsiveImages = Record<ResponsivePhase, { probe: PngPixels, control: PngPixels }>

function near(actual: number, expected: number, tolerance: number) {
  return Math.abs(actual - expected) <= tolerance
}

/** 每帧重读的 rem 标尺必须稳定；真实根和独立测量尺寸都必须跨断点并恢复。 */
export function validateResponsiveFrames(frames: ResponsiveFrames | undefined, runId: string) {
  if (!frames || Object.keys(frames).length !== contract.phases.length) {
    throw new Error('响应式缺少完整根 viewport 及恢复序列')
  }
  const ids = new Set<string>()
  let original: ResponsiveFrame['original'] | undefined
  let threshold: number | undefined
  let ratio: number | undefined
  for (const phase of contract.phases) {
    const frame = frames[phase]
    if (!validResponsiveFrame(frame, runId, phase) || ids.has(frame.requestId)) {
      throw new Error('响应式根 viewport 请求身份或独立几何无效')
    }
    ids.add(frame.requestId)
    original ??= frame.original
    threshold ??= frame.threshold.width
    ratio ??= frame.viewport.pixelRatio
    const tolerance = 1.01 / ratio
    const expectedWidth = phase === 'restored' ? original.width : Math.ceil(threshold * (phase === 'wide' ? contract.wideRatio : contract.narrowRatio))
    if (frame.viewport.pixelRatio !== ratio || !near(frame.original.width, original.width, tolerance) || !near(frame.original.height, original.height, tolerance)
      || !near(frame.threshold.width, threshold, tolerance) || !near(frame.threshold.height, 1, tolerance)
      || !near(frame.requested.width, expectedWidth, tolerance) || !near(frame.requested.height, original.height, tolerance)
      || !near(frame.viewport.width, frame.requested.width, tolerance) || !near(frame.viewport.height, original.height, tolerance)
      || !near(frame.viewport.measuredWidth, frame.viewport.width, tolerance) || !near(frame.viewport.measuredHeight, frame.viewport.height, tolerance)
      || (phase === 'wide' ? frame.viewport.width <= threshold + 10 : phase !== 'restored' && frame.viewport.width >= threshold - 10)) {
      throw new Error('响应式根 viewport 未跨断点、rem 标尺变化或原始尺寸未恢复')
    }
  }
}

function validateCanvas(image: PngPixels, panel: { width: number, height: number }, scale: number) {
  if (Math.abs(image.width - contract.canvas.width * scale) > 1 || Math.abs(image.height - contract.canvas.height * scale) > 1) {
    throw new Error('响应式 PNG 尺寸与宿主固定画布不符')
  }
  const { left, top } = contract.panel
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const logicalX = (x + 0.5) / scale
      const logicalY = (y + 0.5) / scale
      const atBoundary = [logicalX - left, logicalX - left - panel.width, logicalY - top, logicalY - top - panel.height].some(value => Math.abs(value * scale) <= 1)
      if (atBoundary) {
        continue
      }
      const inside = logicalX > left && logicalX < left + panel.width && logicalY > top && logicalY < top + panel.height
      const expected = inside ? [14, 165, 233, 255] : [247, 250, 251, 255]
      const offset = (y * image.width + x) * 4
      if (expected.some((value, channel) => Math.abs(image.data[offset + channel]! - value) > 2)) {
        throw new Error('响应式 PNG 颜色或矩形区域与宿主独立几何不符')
      }
    }
  }
}

/** 只接受固定画布中的蓝色矩形，按真实根宽度独立判定媒体条件是否生效。 */
export function evaluateResponsive(frames: ResponsiveFrames, images: ResponsiveImages, runId: string): NativeCaseResult {
  validateResponsiveFrames(frames, runId)
  let passed = true
  const measurements: Record<string, number> = {}
  for (const phase of contract.phases) {
    const frame = frames[phase]
    const tolerance = 1.01 / frame.viewport.pixelRatio
    for (const role of ['probe', 'control'] as const) {
      const rect = frame.geometry[role]
      const container = frame.geometry[`${role}Container`]
      if (!near(container.width, contract.canvas.width, tolerance) || !near(container.height, contract.canvas.height, tolerance)
        || !near(rect.left - container.left, contract.panel.left, tolerance) || !near(rect.top - container.top, contract.panel.top, tolerance)
        || !near(rect.height, contract.panel.height, tolerance) || rect.width > contract.canvas.width - contract.panel.left) {
        throw new Error('响应式宿主夹具的画布、锚点或高度无效')
      }
      if (role === 'control' && !near(rect.width, contract.panel.width, tolerance)) {
        throw new Error('响应式 control 未保持固定宽度')
      }
      validateCanvas(images[phase][role], rect, frame.viewport.pixelRatio)
      if (role === 'probe') {
        const expectedWidth = frame.viewport.width < frame.threshold.width ? contract.panel.matchedWidth : contract.panel.width
        passed &&= near(rect.width, expectedWidth, tolerance)
        measurements[phase] = rect.width
      }
    }
  }
  return { id: contract.id, status: passed ? 'supported' : 'unsupported', ...(passed ? {} : { reason: '真实根 viewport 跨断点及恢复后未呈现 max-md 对应的宽度', failureStage: 'runtime' as const }), checkpoints: [{ name: contract.checkpoint, passed, actual: JSON.stringify(measurements), expected: '根 viewport 窄→宽→窄→原始尺寸；probe 按 width < 48rem 切换 200/80px，control 保持 80px' }] }
}
