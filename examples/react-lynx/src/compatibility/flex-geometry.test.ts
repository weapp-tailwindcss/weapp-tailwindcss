import type { NativeGeometryEvidence, NativeRect } from './types'
import { expect, it } from 'vitest'
import { compatibilityCases } from './catalog'
import { evaluateGeometry } from './geometry'

function rect(left: number, top: number, width: number, height: number): NativeRect {
  return { left, top, width, height, right: left + width, bottom: top + height }
}

function geometry(id: string): NativeGeometryEvidence {
  const container = { probeContainer: rect(10, 20, 160, 140), controlContainer: rect(200, 300, 160, 140) }
  if (id === 'flex-grow') {
    return { ...container, probe: rect(16, 26, 91, 24), control: rect(206, 306, 24, 24), probeChild: rect(16, 26, 8, 8), controlChild: rect(206, 306, 8, 8) }
  }
  if (id === 'flex-wrap-order') {
    return { ...container, probe: rect(40, 26, 64, 52), control: rect(206, 306, 64, 24), probeChild: rect(40, 54, 40, 24), controlChild: rect(250, 306, 40, 24) }
  }
  return { ...container, probe: rect(16, 26, 108, 24), control: rect(206, 306, 24, 24), probeChild: rect(16, 26, 80, 24), controlChild: rect(206, 306, 12, 24) }
}

it.each(['flex-grow', 'flex-wrap-order', 'flex-shorthand-shrink'])('%s 接受有布局压力的完整几何', (id) => {
  const item = compatibilityCases.find(item => item.id === id)!
  expect(evaluateGeometry(item, geometry(id)).status).toBe('supported')
})

it.each([
  ['flex-grow', 'probe', 'width', 74],
  ['flex-grow', 'probe', 'width', 66],
  ['flex-wrap-order', 'probe', 'left', 16],
  ['flex-wrap-order', 'probe', 'height', 24],
  ['flex-wrap-order', 'probeChild', 'top', 26],
  ['flex-shorthand-shrink', 'probe', 'width', 24],
  ['flex-shorthand-shrink', 'probeChild', 'width', 54],
] as const)('%s 缺少单项效果 %s.%s 不能由其他变化代替', (id, node, property, value) => {
  const evidence = geometry(id)
  evidence[node][property] = value
  const item = compatibilityCases.find(item => item.id === id)!
  expect(evaluateGeometry(item, evidence).status).toBe('unsupported')
})

it.each(['flex-grow', 'flex-wrap-order', 'flex-shorthand-shrink'])('%s 无效对照阻断取证', (id) => {
  const item = compatibilityCases.find(item => item.id === id)!
  const evidence = geometry(id)
  evidence.control.width += 10
  expect(evaluateGeometry(item, evidence)).toMatchObject({ status: 'not-tested', checkpoints: [{ name: 'geometry:fixture-control', passed: false }] })
})
