import type { CompatibilityCase, NativeGeometryEvidence } from './types'
import { expect, it } from 'vitest'
import { evaluateGeometry } from './geometry'

const item = { id: 'sizing-fixed' } as CompatibilityCase
const metrics = { version: 1 as const, source: 'lynx-native-screen-v1' as const, width: 375, height: 812, pixelRatio: 3 }

function rect(left: number, top: number, width: number, height: number) {
  return { left, top, width, height, right: left + width, bottom: top + height }
}

function geometry(width = 123, height = 22.5): NativeGeometryEvidence {
  return {
    probeContainer: rect(10, 20, 160, 96),
    controlContainer: rect(200, 300, 160, 96),
    probe: rect(18, 28, width, height),
    control: rect(208, 308, 80, 64),
    probeChild: rect(22, 32, 4, 4),
    controlChild: rect(212, 312, 4, 4),
  }
}

it.each([320, 375, 402, 768])('宽度和 45rpx 高度同时符合宿主 screen=%s 时通过', (screenWidth) => {
  expect(evaluateGeometry(item, geometry(123, 45 * screenWidth / 750), { ...metrics, width: screenWidth }).status).toBe('supported')
})

it.each([40, 45, 0, 64, 22.5 + 0.5])('宽度正确但高度 %s 不正确时拒绝支持', (height) => {
  expect(evaluateGeometry(item, geometry(123, height), metrics).status).not.toBe('supported')
})

it.each([80, 122, 124])('错误宽度 %s 不能被正确高度掩盖', (width) => {
  expect(evaluateGeometry(item, geometry(width), metrics).status).toBe('unsupported')
})

it('缺少宿主 screen 或只用 viewport 推导高度时不能通过', () => {
  expect(evaluateGeometry(item, geometry()).status).toBe('not-tested')
  expect(evaluateGeometry(item, geometry(123, 45 * 320 / 750), metrics).status).toBe('unsupported')
})

it.each(['width', 'height', 'pixelRatio'] as const)('无效 %s 参数不能参与尺寸判定', (field) => {
  for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(evaluateGeometry(item, geometry(), { ...metrics, [field]: value }).status).toBe('not-tested')
  }
})

it.each(['control', 'controlContainer', 'probeChild', 'controlChild'] as const)('对照或标记 %s 不符合预声明布局时不能下结论', (field) => {
  const evidence = geometry()
  evidence[field].width += 2
  evidence[field].right += 2
  expect(evaluateGeometry(item, evidence, metrics).status).toBe('not-tested')
})

it('保留一物理像素的布局取整容差，不按固定 CSS 像素放宽', () => {
  expect(evaluateGeometry(item, geometry(123 + 0.3, 22.5 - 0.3), metrics).status).toBe('supported')
  expect(evaluateGeometry(item, geometry(123 + 0.5, 22.5), metrics).status).toBe('unsupported')
})
