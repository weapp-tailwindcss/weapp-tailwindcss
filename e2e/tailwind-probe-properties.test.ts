import type { CapabilityReport, CaseContract, SemanticAssertion } from './tailwind-capabilities/types'
import { describe, expect, it } from 'vitest'
import { assertionPassed, validateCapabilityReport } from './tailwind-capabilities/report'
import { weappContract, weappExpectedStyles, weappPhases, weappRuntimeAssertions } from './tailwind-capabilities/weapp/contract'
import { weappProbes } from './tailwind-capabilities/weapp/fixtures'
import { webContract, webRuntimeAssertions } from './tailwind-capabilities/web/contract'
import { webProbes } from './tailwind-capabilities/web/probes'

const sides = ['top', 'right', 'bottom', 'left']
const corners = ['top-left', 'top-right', 'bottom-right', 'bottom-left']
const expectedProperties: Record<string, string[]> = {
  padding: sides.map(side => `padding-${side}`),
  radius: corners.map(corner => `border-${corner}-radius`),
  border: sides.flatMap(side => [`border-${side}-width`, `border-${side}-style`]),
}

function verify(contract: CaseContract, assertions: SemanticAssertion[]) {
  const hash = '0'.repeat(64)
  const report: CapabilityReport = {
    schemaVersion: 2,
    runId: 'property-contract',
    target: 'web-chromium',
    observedAt: new Date().toISOString(),
    identity: { sourceHash: hash, lockfileHash: hash, catalogHash: hash, fixtureHash: hash, expectationsHash: hash, versions: { tailwindcss: '4.3.3' } },
    environment: { mode: 'protocol-test' },
    results: [{ id: contract.id, status: 'passed', support: 'supported', assertions, artifacts: ['measurements.json'], warnings: [] }],
    artifacts: [{ path: 'measurements.json', sha256: hash, byteLength: 1, kind: 'measurements', runId: 'property-contract', caseIds: [contract.id] }],
  }
  return () => validateCapabilityReport(report, [contract], report.identity, report.runId, report.target)
}

describe('多属性 utility 不能由单属性代表完整语义', () => {
  it.each(Object.entries(expectedProperties))('微信 %s 必须逐项声明全部属性', (id, properties) => {
    const probe = weappProbes.find(item => item.id === id)!
    const styles = 'styles' in probe ? probe.styles as Record<string, string> : {}
    expect(Object.keys(styles)).toEqual(expect.arrayContaining(properties))
  })

  it.each(['padding', 'size', 'border-width', 'border-radius', 'important'])('Web %s 的主属性正确但其他属性丢失不能通过', (id) => {
    const probe = webProbes.find(item => item.id === id)!
    const observation = { actual: probe.expected, styles: {} }
    expect(webRuntimeAssertions(probe, 'computed', observation).some(item => !assertionPassed(item))).toBe(true)
  })

  it.each(['padding', 'size', 'border-width', 'border-radius', 'important'])('Web %s 逐个拒绝缺失、错误与被删除的属性断言', (id) => {
    const probe = webProbes.find(item => item.id === id)!
    const contract = webContract(probe)
    const generated: SemanticAssertion = { name: 'generated', stage: 'generation', actual: true, expected: true }
    const correct = webRuntimeAssertions(probe, 'computed', { actual: probe.expected, styles: probe.styles })
    expect(verify(contract, [generated, ...correct])).not.toThrow()
    for (const property of Object.keys(probe.styles!)) {
      for (const wrong of [undefined, 'wrong']) {
        const styles = { ...probe.styles, [property]: wrong } as Record<string, string>
        expect(verify(contract, [generated, ...webRuntimeAssertions(probe, 'computed', { actual: probe.expected, styles })])).toThrow(/style/)
      }
      expect(verify(contract, [generated, ...correct.filter(item => item.name !== `computed/style/${property}`)])).toThrow(/style/)
    }
  })

  it.each(['padding', 'radius', 'border', 'size-width', 'size-height'])('微信 %s 逐个拒绝目标和参考的缺失或错误属性', (id) => {
    const probe = weappProbes.find(item => item.id === id)!
    const contract = weappContract(probe)
    const styles = weappExpectedStyles(probe, 'default')
    const correct = weappRuntimeAssertions(probe, 'default', styles, styles)
    expect(verify(contract, correct)).not.toThrow()
    for (const property of Object.keys(styles)) {
      for (const wrong of [undefined, 'wrong']) {
        const changed = { ...styles, [property]: wrong }
        expect(verify(contract, weappRuntimeAssertions(probe, 'default', changed, styles))).toThrow(/style/)
        expect(verify(contract, weappRuntimeAssertions(probe, 'default', styles, changed))).toThrow(/reference/)
      }
      expect(verify(contract, correct.filter(item => item.name !== `default/style/${property}`))).toThrow(/style/)
    }
  })

  it('微信动态宽度每个阶段均要求独立参考且缺少阶段不能通过', () => {
    const probe = weappProbes.find(item => item.id === 'dynamic-width')!
    const contract = weappContract(probe)
    const correct = weappPhases(probe).flatMap(phase => weappRuntimeAssertions(probe, phase, weappExpectedStyles(probe, phase), weappExpectedStyles(probe, phase)))
    expect(verify(contract, correct)).not.toThrow()
    for (const phase of weappPhases(probe)) {
      expect(verify(contract, correct.filter(item => !item.name.startsWith(`${phase}/`)))).toThrow(phase)
      const wrong = correct.map(item => item.name === `${phase}/reference/width` ? { ...item, actual: '99px' } : item)
      expect(verify(contract, wrong)).toThrow(/reference/)
    }
  })
})
