import type { CompatibilityCase, NativeCaseResult, NativeGeometryEvidence, NativeRect } from './types'

function validRect(value: NativeRect | undefined): value is NativeRect {
  return Boolean(value && ['width', 'height', 'left', 'right', 'top', 'bottom'].every(key => Number.isFinite(value[key as keyof NativeRect]))
    && value.width > 0 && value.height > 0)
}

function relativeRect(rect: NativeRect, parent: NativeRect) {
  return { width: rect.width, height: rect.height, left: rect.left - parent.left, top: rect.top - parent.top }
}

function rectText(rect: ReturnType<typeof relativeRect>) {
  return `${rect.left},${rect.top},${rect.width},${rect.height}`
}

function closeTo(actual: number, expected: number, tolerance = 1.5) {
  return Math.abs(actual - expected) <= tolerance
}

function geometryPassed(item: CompatibilityCase, geometry: NativeGeometryEvidence) {
  const { probe, control, probeContainer, controlContainer, probeChild, controlChild } = geometry
  const styled = relativeRect(probe, probeContainer)
  const plain = relativeRect(control, controlContainer)
  const child = relativeRect(probeChild, probe)
  const plainChild = relativeRect(controlChild, control)
  // 两列的屏幕原点不参与比较；只保留各自容器及节点内部的样式影响。
  const changed = [
    Math.abs(styled.width - plain.width),
    Math.abs(styled.height - plain.height),
    Math.abs(styled.left - plain.left),
    Math.abs(styled.top - plain.top),
    Math.abs(child.left - plainChild.left),
    Math.abs(child.top - plainChild.top),
  ].some(value => value > 1)
  if (!changed) {
    return false
  }
  if (item.id === 'layout-aspect') {
    return closeTo(probe.width, control.width) && closeTo(probe.height, probe.width * 3 / 4) && Math.abs(probe.height - control.height) > 1
  }
  if (item.id === 'sizing-fixed') {
    return closeTo(probe.width, 123) && Math.abs(probe.width - control.width) > 1
  }
  if (item.id === 'sizing-size') {
    return closeTo(probe.width, 44) && closeTo(probe.height, 44)
  }
  if (item.id === 'accessibility-sr') {
    return closeTo(probe.width, 1) && closeTo(probe.height, 1)
  }
  if (item.id === 'layout-box-sizing') {
    return closeTo(probe.width, 96) && closeTo(probe.height, 64)
      && closeTo(control.width, 116) && closeTo(control.height, 84)
  }
  if (item.id === 'sizing-min-max' || item.id === 'syntax-css-variable') {
    // 原生 rem 随屏幕适配；同时验证 min-width 确实扩大宽度及 max-height 的精确限制。
    const widthPassed = item.id === 'sizing-min-max' ? probe.width > control.width + 1 : closeTo(probe.width, 40)
    return widthPassed && closeTo(control.width, 40) && closeTo(probe.height, 240) && closeTo(control.height, 300)
  }
  if (item.id === 'variant-responsive') {
    return closeTo(probe.width, 200) && Math.abs(probe.width - control.width) > 1
  }
  return true
}

/** 几何探针同时采集每组参考容器，缺证时不形成支持或不支持结论。 */
export async function collectGeometry(item: CompatibilityCase, measure: (id: string) => Promise<NativeRect | undefined>): Promise<NativeCaseResult> {
  const [probe, control, probeContainer, controlContainer, probeChild, controlChild] = await Promise.all([
    measure(`probe-${item.id}`),
    measure(`control-${item.id}`),
    measure(`probe-container-${item.id}`),
    measure(`control-container-${item.id}`),
    measure(`probe-child-${item.id}-a`),
    measure(`probe-child-control-${item.id}-a`),
  ])
  return evaluateGeometry(item, { probe, control, probeContainer, controlContainer, probeChild, controlChild })
}

/** 实时采集和离线报告校验共用相同的坐标边界与断言。 */
export function evaluateGeometry(item: CompatibilityCase, evidence?: Partial<NativeGeometryEvidence>): NativeCaseResult {
  const { probe, control, probeContainer, controlContainer, probeChild, controlChild } = evidence ?? {}
  if (!validRect(probe) || !validRect(control) || !validRect(probeContainer) || !validRect(controlContainer) || !validRect(probeChild) || !validRect(controlChild)) {
    return { id: item.id, status: 'not-tested', reason: 'boundingClientRect 未返回完整、有限且非空的 probe/control、容器和子节点区域', checkpoints: [{ name: 'geometry:rendered', passed: false }] }
  }
  if (!closeTo(probeContainer.width, controlContainer.width, 1) || !closeTo(probeContainer.height, controlContainer.height, 1)) {
    return { id: item.id, status: 'not-tested', reason: 'probe/control 参考容器尺寸不同，不能形成同条件几何对照', checkpoints: [{ name: 'geometry:reference-frames', passed: false, actual: rectText(probeContainer), expected: rectText(controlContainer) }] }
  }
  const geometry = { probe, control, probeContainer, controlContainer, probeChild, controlChild }
  const passed = geometryPassed(item, geometry)
  return {
    id: item.id,
    status: passed ? 'supported' : 'unsupported',
    reason: passed ? undefined : 'Tailwind probe 与 control 的几何结果没有满足 case 断言',
    failureStage: passed ? undefined : 'runtime',
    geometry,
    checkpoints: [{
      name: 'geometry:probe-vs-control',
      passed,
      actual: `${rectText(relativeRect(probe, probeContainer))}; child=${rectText(relativeRect(probeChild, probe))}`,
      expected: `control=${rectText(relativeRect(control, controlContainer))}; child=${rectText(relativeRect(controlChild, control))}`,
    }],
  }
}
