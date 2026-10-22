import type { NativeGeometryEvidence, NativeRect } from './types'

export interface NativeScreenMetrics {
  version: 1
  source: 'lynx-native-screen-v1'
  width: number
  height: number
  pixelRatio: number
}

export const fixedSizeContract = {
  version: 1,
  id: 'sizing-fixed',
  candidate: 'w-[123px] h-[45rpx]',
  width: 123,
  heightRpx: 45,
  // Lynx 4.0.1 CSSStyleUtils::ToLength 使用 screen_width / 750，独立于根 viewport。
  rpxRatio: 750,
  container: { width: 160, height: 96 },
  control: { width: 80, height: 64 },
  offset: 8,
  marker: { offset: 4, size: 4 },
  colors: { body: [37, 99, 235], marker: [249, 115, 22], background: [255, 255, 255] },
} as const

/** 参数必须来自同一绑定宿主；JS SystemInfo 或可调整的根 viewport 不能代替。 */
export function validNativeScreenMetrics(value: unknown): value is NativeScreenMetrics {
  if (!value || typeof value !== 'object') {
    return false
  }
  const metrics = value as NativeScreenMetrics
  return metrics.version === 1 && metrics.source === 'lynx-native-screen-v1'
    && [metrics.width, metrics.height, metrics.pixelRatio].every(number => typeof number === 'number' && Number.isFinite(number) && number > 0)
}

/** 同时约束宽、高和参考布局；布局容差最多一物理像素。 */
export function checkFixedSizeGeometry(geometry: NativeGeometryEvidence, screen: NativeScreenMetrics) {
  const tolerance = 1 / screen.pixelRatio + 0.01
  const close = (actual: number, expected: number) => Math.abs(actual - expected) <= tolerance
  const { probe, control, probeContainer, controlContainer, probeChild, controlChild } = geometry
  function position(child: NativeRect, parent: NativeRect, offset: number) {
    return close(child.left - parent.left, offset) && close(child.top - parent.top, offset)
  }
  const validControl = [probeContainer, controlContainer].every(rect => close(rect.width, fixedSizeContract.container.width) && close(rect.height, fixedSizeContract.container.height))
    && close(control.width, fixedSizeContract.control.width) && close(control.height, fixedSizeContract.control.height)
    && position(control, controlContainer, fixedSizeContract.offset)
    && [probeChild, controlChild].every(rect => close(rect.width, fixedSizeContract.marker.size) && close(rect.height, fixedSizeContract.marker.size))
    && position(probeChild, probe, fixedSizeContract.marker.offset) && position(controlChild, control, fixedSizeContract.marker.offset)
  const expectedHeight = fixedSizeContract.heightRpx * screen.width / fixedSizeContract.rpxRatio
  return {
    control: validControl,
    probe: close(probe.width, fixedSizeContract.width) && close(probe.height, expectedHeight) && position(probe, probeContainer, fixedSizeContract.offset),
    expectedHeight,
  }
}
