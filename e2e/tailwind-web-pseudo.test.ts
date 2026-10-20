import type { CapabilityReport } from './tailwind-capabilities/types'
import { describe, expect, it } from 'vitest'
import { loadDefaultDesignSystem, loadInventory } from './tailwind-capabilities/inventory'
import { validateCapabilityReport } from './tailwind-capabilities/report'
import { webContract, webRuntimeAssertions } from './tailwind-capabilities/web/contract'
import { webRuntimeCoverage } from './tailwind-capabilities/web/coverage'
import { pseudoVariantProbes } from './tailwind-capabilities/web/variants/pseudo'

function reportFor(probe: typeof pseudoVariantProbes[number], brokenGuard = false) {
  const contract = webContract(probe)
  const hash = '0'.repeat(64)
  const identity = { sourceHash: hash, lockfileHash: hash, catalogHash: hash, fixtureHash: hash, expectationsHash: hash, versions: { tailwindcss: '4.3.3' } }
  const states = [['before', probe.before!], ...(probe.checkpoints ?? []).map(item => [item.name, item.expected]), ['after', probe.expected], ['restored', probe.before!]]
  const report: CapabilityReport = {
    schemaVersion: 2,
    runId: 'pseudo-contract',
    target: 'web-chromium',
    observedAt: new Date().toISOString(),
    identity,
    environment: { engine: 'chromium' },
    results: [{ id: contract.id, status: 'passed', support: 'supported', assertions: [{ name: 'generated', stage: 'generation', actual: true, expected: true }, ...states.flatMap(([state, actual]) => webRuntimeAssertions(probe, state!, { actual: actual!, renderFrames: [10, 20], guards: Object.fromEntries((probe.guards ?? []).map(guard => [guard.name, brokenGuard ? 'wrong-host-or-context' : (state === 'before' || state === 'restored') ? guard.before ?? guard.expected : guard.expected])) }))], artifacts: ['measurement.json'], warnings: [] }],
    artifacts: [{ path: 'measurement.json', sha256: hash, byteLength: 1, kind: 'measurements', runId: 'pseudo-contract', caseIds: [contract.id] }],
  }
  return { report, verify: () => validateCapabilityReport(report, [contract], identity, report.runId, 'web-chromium') }
}

describe('伪元素与真实上下文的独立验收', () => {
  it.each(pseudoVariantProbes)('$id 主属性正确也不能遗漏宿主或真实上下文负控制', (probe) => {
    expect(probe.guards?.length).toBeGreaterThan(0)
    expect(reportFor(probe).verify).not.toThrow()
    expect(reportFor(probe, true).verify).toThrow(/guard/)
    const missing = reportFor(probe)
    missing.report.results[0]!.assertions = missing.report.results[0]!.assertions.filter(item => !item.name.includes('/guard/'))
    expect(missing.verify).toThrow(/guard/)
  })

  it('每条伪元素候选独立由上游生成，选择器边界不能由继承冒充', async () => {
    const ds = await loadDefaultDesignSystem()
    for (const probe of pseudoVariantProbes) {
      expect(ds.candidatesToCss([probe.candidate])[0], probe.id).toBeTruthy()
    }
    for (const id of ['controlled-placeholder', 'controlled-first-letter', 'controlled-first-line', 'controlled-file', 'controlled-marker', 'controlled-selection']) {
      const probe = pseudoVariantProbes.find(item => item.id === id)!
      expect(probe.guards!.some(item => item.kind === 'style' && item.selector === '#probe' && item.property === 'color' && !item.pseudo), id).toBe(true)
    }
    const selection = pseudoVariantProbes.find(item => item.id === 'controlled-selection')!
    expect(selection.controls!.some(item => item.kind === 'selection')).toBe(true)
    expect(selection.guards!.find(item => item.kind === 'selection')?.expected).toBe('selectable sample')
  })

  it('未受控能力逐项保留真实限制，不能默认为通过', async () => {
    const coverage = webRuntimeCoverage(await loadInventory())
    for (const root of ['visited', 'autofill', 'contrast-less']) {
      const feature = coverage.find(item => item.featureId === `variant/static/${root}`)!
      expect(feature.status).toBe('not-run')
      expect(feature.reason).not.toMatch(/尚未提供此注册能力/)
    }
  })
})
