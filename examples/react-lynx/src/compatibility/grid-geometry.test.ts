import type { NativeGeometryEvidence, NativeRect } from './types'
import { expect, it } from 'vitest'
import { compatibilityCases } from './catalog'
import { evaluateGeometry } from './geometry'

function rect(left: number, top: number, width: number, height: number): NativeRect {
  return { left, top, width, height, right: left + width, bottom: top + height }
}

function geometry(id: string): NativeGeometryEvidence {
  const container = { probeContainer: rect(10, 20, 160, 140), controlContainer: rect(200, 300, 160, 140) }
  if (id === 'grid-placement') {
    return { ...container, probe: rect(16, 26, 84, 52), control: rect(250, 334, 40, 24), probeChild: rect(16, 26, 8, 8), controlChild: rect(250, 334, 8, 8) }
  }
  if (id === 'grid-auto') {
    return { ...container, probe: rect(16, 26, 140, 24), control: rect(206, 306, 140, 68), probeChild: rect(88, 26, 40, 24), controlChild: rect(206, 342, 40, 24) }
  }
  return { ...container, probe: rect(56, 26, 100, 44), control: rect(206, 306, 100, 44), probeChild: rect(96, 26, 20, 12), controlChild: rect(206, 306, 20, 12) }
}

it.each(['grid-placement', 'grid-auto', 'grid-justify-self'])('%s 只接受完整期望几何', (id) => {
  const item = compatibilityCases.find(item => item.id === id)!
  expect(evaluateGeometry(item, geometry(id)).status).toBe('supported')
})

it.each([
  ['grid-placement', 'probe', 'width', 40],
  ['grid-placement', 'probe', 'height', 24],
  ['grid-placement', 'probe', 'left', 60],
  ['grid-placement', 'probe', 'top', 54],
  ['grid-auto', 'probeChild', 'left', 44],
  ['grid-auto', 'probeChild', 'top', 46],
  ['grid-auto', 'probe', 'height', 32],
  ['grid-justify-self', 'probe', 'left', 16],
  ['grid-justify-self', 'probeChild', 'left', 56],
] as const)('%s 缺少单项布局效果 %s.%s 时不能由其他差异代替', (id, node, property, value) => {
  const item = compatibilityCases.find(item => item.id === id)!
  const evidence = geometry(id)
  evidence[node][property] = value
  expect(evaluateGeometry(item, evidence).status).toBe('unsupported')
})

it.each(['grid-placement', 'grid-auto', 'grid-justify-self'])('%s 对照布局失效时阻断而非判定 utility 不支持', (id) => {
  const item = compatibilityCases.find(item => item.id === id)!
  const evidence = geometry(id)
  evidence.control.width += 10
  expect(evaluateGeometry(item, evidence)).toMatchObject({ status: 'not-tested', checkpoints: [{ name: 'geometry:fixture-control', passed: false }] })
})
