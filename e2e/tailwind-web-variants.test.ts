import type { Page } from 'playwright'
import type { CapabilityReport } from './tailwind-capabilities/types'
import { describe, expect, it, vi } from 'vitest'
import { loadDefaultDesignSystem, loadInventory } from './tailwind-capabilities/inventory'
import { validateCapabilityReport } from './tailwind-capabilities/report'
import { activateProbe, prepareProbe } from './tailwind-capabilities/web/actions'
import { webContract, webRuntimeAssertions } from './tailwind-capabilities/web/contract'
import { webRuntimeCoverage } from './tailwind-capabilities/web/coverage'
import { variantWebProbes } from './tailwind-capabilities/web/variants'

function reportFor(probe: typeof variantWebProbes[number], changes: Record<string, string> = {}) {
  const contract = webContract(probe)
  const hash = '0'.repeat(64)
  const identity = { sourceHash: hash, lockfileHash: hash, catalogHash: hash, fixtureHash: hash, expectationsHash: hash, versions: { tailwindcss: '4.3.3' } }
  const states = [['before', probe.before!], ...(probe.checkpoints ?? []).map(item => [item.name, item.expected]), ['after', probe.expected], ['restored', probe.before!]]
  const report: CapabilityReport = {
    schemaVersion: 2,
    runId: 'variant-contract',
    target: 'web-chromium',
    observedAt: new Date().toISOString(),
    identity,
    environment: { engine: 'chromium' },
    results: [{ id: contract.id, status: 'passed', support: 'supported', assertions: [{ name: 'generated', stage: 'generation', actual: true, expected: true }, ...states.flatMap(([state, expected]) => webRuntimeAssertions(probe, state!, { actual: changes[state!] ?? expected!, renderFrames: [10, 20], guards: Object.fromEntries((probe.guards ?? []).map(guard => [guard.name, (state === 'before' || state === 'restored') ? guard.before ?? guard.expected : guard.expected])) }))], artifacts: ['measurements.json'], warnings: [] }],
    artifacts: [{ path: 'measurements.json', sha256: hash, byteLength: 1, kind: 'measurements', runId: 'variant-contract', caseIds: [contract.id] }],
  }
  return { report, verify: () => validateCapabilityReport(report, [contract], identity, report.runId, 'web-chromium') }
}

describe('受控 variant 的触发与恢复', () => {
  it.each(variantWebProbes)('$id 拒绝不触发、无条件生效和未恢复', (probe) => {
    expect(probe.before).not.toBe(probe.expected)
    expect(probe.controls?.length).toBeGreaterThan(0)
    expect(reportFor(probe).verify).not.toThrow()
    expect(reportFor(probe, { after: probe.before! }).verify).toThrow(/after/)
    expect(reportFor(probe, { before: probe.expected }).verify).toThrow(/before/)
    expect(reportFor(probe, { restored: probe.expected }).verify).toThrow(/restored/)
  })

  it('具名作用域和组合条件必须保留中间负控制', () => {
    for (const id of ['named-group-scope', 'named-peer-scope', 'named-container-scope', 'responsive-hover-combination', 'container-data-combination']) {
      const probe = variantWebProbes.find(item => item.id === id)!
      expect(probe.checkpoints, id).toHaveLength(id.endsWith('-combination') ? 2 : 1)
      for (const checkpoint of probe.checkpoints!) {
        expect(checkpoint.expected).toBe(probe.before)
        const correct = reportFor(probe)
        expect(correct.verify).not.toThrow()
        const partial = reportFor(probe, { [checkpoint.name]: probe.expected })
        expect(partial.verify).toThrow(new RegExp(checkpoint.name))
        correct.report.results[0]!.assertions = correct.report.results[0]!.assertions.filter(item => item.name !== checkpoint.name)
        expect(correct.verify).toThrow(new RegExp(checkpoint.name))
      }
    }
  })

  it('媒体与结构夹具绑定固定上游真实候选，并逐项登记覆盖', async () => {
    const inventory = await loadInventory()
    const registered = new Set(inventory.variants.map(item => item.id))
    const ds = await loadDefaultDesignSystem()
    const coverage = webRuntimeCoverage(inventory, 'firefox')
    for (const probe of variantWebProbes) {
      expect(ds.candidatesToCss([probe.candidate])[0], probe.id).toBeTruthy()
      for (const feature of probe.features.filter(item => item.startsWith('variant/'))) {
        expect(registered.has(feature), feature).toBe(true)
        expect(coverage.find(item => item.featureId === feature)?.caseIds).toContain(`runtime/${probe.id}`)
      }
    }
    const uncovered = ['any-pointer-none', 'autofill', 'contrast-less', 'inverted-colors', 'pointer-none']
    expect(coverage.filter(item => item.featureId.startsWith('variant/') && item.status === 'not-run').map(item => item.featureId)).toEqual(uncovered.map(root => `variant/static/${root}`))
  })

  it('媒体动作必须设置前置、触发并恢复，组合检查点在真实动作之后执行', async () => {
    const probe = variantWebProbes.find(item => item.id === 'responsive-hover-combination')!
    const checkpoints: Array<[string, number, boolean]> = []
    let width = 640
    let hovered = false
    const page = {
      setViewportSize: vi.fn(async (viewport: { width: number }) => { width = viewport.width }),
      mouse: { move: vi.fn(async () => { hovered = false }) },
      locator: vi.fn(() => ({ hover: vi.fn(async () => { hovered = true }) })),
    } as unknown as Page
    const cleanup = await prepareProbe(page, probe)
    const restore = await activateProbe(page, probe, async ({ name }) => {
      checkpoints.push([name, width, hovered])
    })
    expect(checkpoints).toEqual([['only-viewport', 800, false], ['only-hover', 640, true]])
    expect([width, hovered]).toEqual([800, true])
    await restore()
    expect([width, hovered]).toEqual([640, false])
    await cleanup()
    expect([width, hovered]).toEqual([640, false])
  })

  it('组合动作中途失败仍必须恢复已经改变的环境', async () => {
    const probe = variantWebProbes.find(item => item.id === 'responsive-hover-combination')!
    const viewport = vi.fn(async () => {})
    const hover = vi.fn(async () => {
      throw new Error('真实 hover 失败')
    })
    const page = { setViewportSize: viewport, mouse: { move: vi.fn(async () => {}) }, locator: vi.fn(() => ({ hover })) } as unknown as Page
    await expect(activateProbe(page, probe, async () => {})).rejects.toThrow(/真实 hover 失败/)
    expect(viewport).toHaveBeenNthCalledWith(1, { width: 800, height: 480 })
    expect(viewport.mock.calls.at(-1)).toEqual([{ width: 640, height: 480 }])
  })
})
