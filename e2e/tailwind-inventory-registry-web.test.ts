import type { RegistryObservation } from './tailwind-capabilities/registry-web/measure'
import type { CapabilityReport } from './tailwind-capabilities/types'
import { describe, expect, it } from 'vitest'
import { loadInventory } from './tailwind-capabilities/inventory'
import { registryAssertions, registryWebContracts, registryWebCoverage } from './tailwind-capabilities/registry-web/contract'
import { registryGeometryEqual, registryReferenceEffective } from './tailwind-capabilities/registry-web/measure'
import { registryWebProfile, renderRegistryProfile } from './tailwind-capabilities/registry-web/profiles'
import { buildRegistryReference } from './tailwind-capabilities/registry-web/reference'
import { assertionPassed, validateCapabilityReport } from './tailwind-capabilities/report'

describe('Web 全量 utility 独立运行时参考合同', () => {
  it('全部注册 kind/root 都有固定声明、组件上下文和可观测普通属性', async () => {
    const inventory = await loadInventory()
    const profiles = inventory.utilities.map(registryWebProfile)
    const contracts = registryWebContracts(profiles)
    expect(profiles.map(item => item.featureId)).toEqual(inventory.utilities.map(item => item.id))
    expect(new Set(profiles.map(item => item.id)).size).toBe(inventory.utilities.length)
    for (const [index, profile] of profiles.entries()) {
      expect(profile.declarations).toEqual(inventory.utilities[index]!.declarations)
      expect(profile.properties.some(property => !property.startsWith('--')), profile.id).toBe(true)
      expect(profile.html, profile.id).toContain('data-probe')
      expect(profile.css, profile.id).toContain(`[data-case="${index}"]`)
      expect(contracts[index]!.expectation).toEqual({ support: 'supported', stage: 'runtime' })
      expect(contracts[index]!.requiredAssertions).toContain('reference-effective')
      expect(contracts[index]!.expectedValues['styles-match-reference']).toBe(true)
      expect(contracts[index]!.features).toEqual([profile.featureId])
      expect(renderRegistryProfile(profile, true)).not.toContain('CANDIDATE')
      expect(renderRegistryProfile(profile, false)).not.toContain('CANDIDATE')
    }
    const kinds = new Set(profiles.map(item => item.kind))
    for (const kind of ['text', 'svg', 'image', 'table', 'caption', 'cell', 'list', 'grid', 'grid-item', 'flex', 'flex-item', 'scroll', 'children', 'input']) {
      expect(kinds.has(kind as typeof profiles[number]['kind']), kind).toBe(true)
    }
  })

  it('custom-only 工具类使用真实消费属性而非仅比较内部变量', async () => {
    const inventory = await loadInventory()
    for (const root of ['from', 'via', 'to', 'via-none', 'mask-circle', 'mask-radial-at', 'ring-inset', 'ring-offset', 'duration-initial', 'shadow-initial', 'inset-shadow-initial', 'text-shadow-initial', 'space-x-reverse', 'space-y-reverse', 'divide-x-reverse', 'divide-y-reverse', 'snap-mandatory', 'snap-proximity']) {
      const entry = inventory.utilities.find(item => item.root === root)!
      const profile = registryWebProfile(entry, 0)
      expect(profile.properties.some(property => !property.startsWith('--')), root).toBe(true)
      expect(profile.css, root).toContain('var(--tw-')
    }
    const coverage = registryWebCoverage(inventory)
    expect(coverage.map(item => item.featureId)).toEqual([...inventory.utilities, ...inventory.variants].map(item => item.id))
    expect(coverage.filter(item => item.status === 'fixture-defined')).toHaveLength(inventory.utilities.length)
    expect(coverage.filter(item => item.status === 'not-run')).toHaveLength(inventory.variants.length)
    expect(coverage.every(item => !('support' in item))).toBe(true)
  })

  it('官方参考独立编译锁定主题、preflight 和每个见证，不从产品产物推导预期', async () => {
    const inventory = await loadInventory()
    const profiles = inventory.utilities.map(registryWebProfile)
    const reference = await buildRegistryReference(profiles)
    expect(reference.identity.themeSha256).toBe(inventory.themeSha256)
    expect(reference.identity.oracle).toBe('isolated-official-tailwindcss-compile')
    expect(reference.css).toMatch(/\.flex\s*\{/)
    expect(reference.css).toMatch(/\.inline-grid\s*\{/)
    expect(reference.css).toContain('--tw-ring-inset')
    expect(reference.css).toContain('box-sizing: border-box')
    expect(reference.css).toContain(`[data-case="${profiles.at(-1)!.index}"]`)
    expect(reference.productInput).toContain('@import "tailwindcss" source(none)')
    expect(reference.productInput).not.toContain('@tailwindcss/vite')
  })

  it('相同默认值、缺失属性或错误产品值都不能通过运行时合同', async () => {
    const inventory = await loadInventory()
    const profile = registryWebProfile(inventory.utilities.find(item => item.root === 'w')!, 0)
    const observation = (width: string, actualWidth: number): RegistryObservation => ({ id: profile.id, styles: { width }, childStyles: [], pseudoStyles: {}, geometry: [0, 0, actualWidth, 64, actualWidth, 64], unavailableProperties: [] })
    const reference = observation('0px', 0)
    const baseline = observation('73px', 73)
    expect(registryAssertions(profile, true, reference, baseline, reference).every(assertionPassed)).toBe(true)
    expect(registryReferenceEffective(reference, reference)).toBe(false)
    expect(registryAssertions(profile, true, reference, reference, reference).every(assertionPassed)).toBe(false)
    expect(registryAssertions(profile, true, observation('', 0), baseline, observation('', 0)).find(item => item.name === 'reference-measurable')?.actual).toBe(false)
    expect(registryGeometryEqual(reference, { ...reference, geometry: [0, 0, 0.2, 64, 0, 64] })).toBe(true)
    expect(registryGeometryEqual(reference, { ...reference, geometry: [0, 0, 0.5, 64, 0, 64] })).toBe(false)
    const wrong = registryAssertions(profile, true, reference, baseline, observation('37px', 37))
    expect(wrong.find(item => item.name === 'styles-match-reference')?.actual).toBe(false)
    const contract = registryWebContracts([profile])[0]!
    const hash = '0'.repeat(64)
    const identity = { sourceHash: hash, lockfileHash: hash, catalogHash: hash, fixtureHash: hash, expectationsHash: hash, versions: { tailwindcss: inventory.tailwindcss } }
    const report: CapabilityReport = { schemaVersion: 2, runId: 'registry-negative', target: 'web-chromium', observedAt: new Date().toISOString(), identity, environment: { engine: 'chromium' }, results: [{ id: profile.id, support: 'supported', status: 'passed', assertions: wrong, artifacts: ['measurements.json'], warnings: [] }], artifacts: [{ path: 'measurements.json', sha256: hash, byteLength: 1, kind: 'measurements', runId: 'registry-negative', caseIds: [profile.id] }] }
    expect(() => validateCapabilityReport(report, [contract], identity, report.runId, 'web-chromium')).toThrow(/styles-match-reference/)
  })
})
