import type { CapabilityReport } from './tailwind-capabilities/types'
import type { WebObservation } from './tailwind-capabilities/web/actions'
import { describe, expect, it } from 'vitest'
import { assertionPassed, validateCapabilityReport } from './tailwind-capabilities/report'
import { webContract, webRuntimeAssertions } from './tailwind-capabilities/web/contract'
import { webProbes } from './tailwind-capabilities/web/probes'

const child = (left: number, top: number, width: number, height: number) => ({ left, top, width, height })
const cases = [
  { id: 'box-sizing', actual: 'border-box', display: 'block', width: 100, height: 60, children: [], broken: { width: 130, height: 90 } },
  { id: 'flex-direction', actual: 'column', display: 'flex', width: 200, height: 100, children: [child(0, 0, 20, 20), child(0, 20, 30, 40)], broken: { children: [child(0, 0, 20, 20), child(20, 0, 30, 40)] } },
  { id: 'flex-alignment', actual: 'center', display: 'flex', width: 200, height: 100, children: [child(0, 40, 20, 20), child(20, 30, 30, 40)], broken: { children: [child(0, 0, 20, 20), child(20, 0, 30, 40)] } },
  { id: 'justify-content', actual: 'space-between', display: 'flex', width: 200, height: 100, children: [child(0, 0, 20, 20), child(170, 0, 30, 40)], broken: { children: [child(0, 0, 20, 20), child(20, 0, 30, 40)] } },
  { id: 'gap', actual: '16px', display: 'flex', width: 200, height: 100, children: [child(0, 0, 20, 20), child(36, 0, 30, 40)], broken: { children: [child(0, 0, 20, 20), child(20, 0, 30, 40)] } },
  { id: 'grid', actual: '80px 120px', display: 'grid', width: 200, height: 100, children: [child(0, 0, 80, 20), child(80, 0, 120, 30)], broken: { display: 'block', children: [child(0, 0, 200, 20), child(0, 20, 200, 30)] } },
  { id: 'flex-grow', actual: '2', display: 'block', width: 380 / 3, height: 20, children: [], broken: { width: 20 } },
  { id: 'flex-shrink', actual: '0', display: 'block', width: 80, height: 20, children: [], broken: { width: 50 } },
]

function reportFor(id: string, observation: Pick<WebObservation, 'actual' | 'layout'>) {
  const probe = webProbes.find(item => item.id === id)!
  const contract = webContract(probe)
  const hash = '0'.repeat(64)
  const identity = { sourceHash: hash, lockfileHash: hash, catalogHash: hash, fixtureHash: hash, expectationsHash: hash, versions: { tailwindcss: '4.3.3' } }
  const report: CapabilityReport = {
    schemaVersion: 2,
    runId: 'layout-contract',
    target: 'web-chromium',
    observedAt: new Date().toISOString(),
    identity,
    environment: { engine: 'chromium' },
    results: [{ id: contract.id, status: 'passed', support: 'supported', assertions: [{ name: 'generated', stage: 'generation', actual: true, expected: true }, ...webRuntimeAssertions(probe, 'computed', observation)], artifacts: ['measurements.json'], warnings: [] }],
    artifacts: [{ path: 'measurements.json', sha256: hash, byteLength: 1, kind: 'measurements', runId: 'layout-contract', caseIds: [contract.id] }],
  }
  return { report, contract, verify: () => validateCapabilityReport(report, [contract], identity, report.runId, 'web-chromium') }
}

describe('Web 布局效果的独立语义', () => {
  it.each(cases)('$id 属性值正确但布局错误仍须失败', ({ id, actual, broken, ...layout }) => {
    const correct = reportFor(id, { actual, layout })
    expect(correct.verify).not.toThrow()
    const wrong = reportFor(id, { actual, layout: { ...layout, ...broken } })
    expect(wrong.report.results[0]!.assertions.find(item => item.name === 'computed')!.actual).toBe(actual)
    expect(wrong.verify).toThrow(/layout/)
  })

  it.each(cases.filter(item => item.display === 'flex' || item.display === 'grid'))('$id 不能用非布局容器的 computed 值冒充生效', ({ id, actual, broken: _broken, ...layout }) => {
    const result = reportFor(id, { actual, layout: { ...layout, display: 'block' } })
    expect(result.verify).toThrow(/layout\/display/)
  })

  it('缺少实际子元素、尺寸或全部布局测量时不能成功', () => {
    const gap = cases.find(item => item.id === 'gap')!
    const { id, actual, broken: _broken, ...layout } = gap
    expect(reportFor(id, { actual, layout: { ...layout, children: [] } }).verify).toThrow(/layout/)
    expect(reportFor(id, { actual }).verify).toThrow(/layout/)
    const omitted = reportFor(id, { actual, layout })
    omitted.report.results[0]!.assertions = omitted.report.results[0]!.assertions.filter(item => !item.name.includes('/layout/'))
    expect(omitted.verify).toThrow(/layout/)
  })

  it('几何误差固定为四分之一像素，不能自行放宽', () => {
    const probe = cases.find(item => item.id === 'gap')!
    const { id, actual, broken: _broken, ...layout } = probe
    const result = reportFor(id, { actual, layout: { ...layout, children: [layout.children[0]!, child(36.2, 0, 30, 40)] } })
    expect(result.verify).not.toThrow()
    const position = result.report.results[0]!.assertions.find(item => item.name === 'computed/layout/child-1/left')!
    expect(assertionPassed(position)).toBe(true)
    position.actual = 36.5
    position.tolerance = 1
    expect(result.verify).toThrow(/允许误差/)
  })
})
