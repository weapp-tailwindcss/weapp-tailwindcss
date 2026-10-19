import type { RegistryObservation } from './tailwind-capabilities/registry-web/measure'
import type { CapabilityReport } from './tailwind-capabilities/types'
import { describe, expect, it } from 'vitest'
import { loadInventory } from './tailwind-capabilities/inventory'
import { registryAssertions, registryWebContracts, registryWebCoverage } from './tailwind-capabilities/registry-web/contract'
import { registryEmittedNegativeDeclaration, registryLimitAssertions, registryWebLimit } from './tailwind-capabilities/registry-web/limits'
import { registryGeometryEqual, registryReferenceEffective } from './tailwind-capabilities/registry-web/measure'
import { registryWebProfile, renderRegistryProfile } from './tailwind-capabilities/registry-web/profiles'
import { buildRegistryReference } from './tailwind-capabilities/registry-web/reference'
import { registryBidiOptions, registryBidiProfiles } from './tailwind-capabilities/registry-web/transport'
import { assertionPassed, validateCapabilityReport } from './tailwind-capabilities/report'

describe('Web 全量 utility 独立运行时参考合同', () => {
  it('语义见证不能采用编译器接受但浏览器语法无效的任意值或零网格线', async () => {
    const inventory = await loadInventory()
    const expected = { '-col': '-col-1', '-row': '-row-1', 'contain': 'contain-[layout]', 'cursor': 'cursor-[crosshair]', 'will-change': 'will-change-[opacity]', 'mask-conic-from': 'mask-conic-from-[25%]', 'mask-conic-to': 'mask-conic-to-[75%]' }
    for (const [root, candidate] of Object.entries(expected)) {
      expect(inventory.utilities.find(item => item.root === root)?.witness, root).toBe(candidate)
    }
  })

  it('默认值和别名建立不同的基线，伪元素必须在正确组件上消费', async () => {
    const inventory = await loadInventory()
    const profile = (root: string) => registryWebProfile(inventory.utilities.find(item => item.root === root)!, 0)
    expect(profile('object-fill').css).toContain('object-fit:contain;')
    expect(profile('font-stretch-condensed').css).toContain('font-stretch:125%;')
    expect(profile('font-stretch-expanded').css).toContain('font-stretch:75%;')
    expect(profile('snap-x').css).toContain('scroll-snap-type:y mandatory;')
    expect(profile('container').css).toContain('max-width:none;')
    expect(profile('subpixel-antialiased').css).toContain('-webkit-font-smoothing:antialiased;')
    expect(profile('placeholder').kind).toBe('input')
    expect(profile('placeholder').html).toContain('placeholder="Tailwind placeholder"')
    expect(profile('placeholder').html).not.toContain('value=')
    expect(profile('placeholder').css).toContain('::placeholder')
  })

  it('限制按引擎、系统和规范预先登记，不由参考无效果推导或覆盖其他引擎', async () => {
    const inventory = await loadInventory()
    const profile = (root: string) => registryWebProfile(inventory.utilities.find(item => item.root === root)!, 0)
    expect(registryWebLimit(profile('mix-blend-plus-darker'), 'chromium', 'linux')?.mode).toBe('rejected-syntax')
    expect(registryWebLimit(profile('mix-blend-plus-darker'), 'webkit', 'linux')).toBeUndefined()
    expect(registryWebLimit(profile('subpixel-antialiased'), 'firefox', 'linux')?.mode).toBe('unavailable-computed')
    expect(registryWebLimit(profile('subpixel-antialiased'), 'firefox', 'darwin')).toBeUndefined()
    expect(registryWebLimit(profile('object-fill'), 'chromium', 'linux')).toBeUndefined()
    const declaration = profile('justify-baseline')
    const positive = registryWebContracts([declaration])[0]!
    const negative = registryWebContracts([declaration], 'chromium', 'linux')[0]!
    expect(negative.id).toBe(positive.id)
    expect(negative.candidate).toBe(positive.candidate)
    expect(positive.expectation.support).toBe('supported')
    expect(negative.expectation).toMatchObject({ support: 'unsupported', stage: 'negative' })
    expect(negative.fixture).toContain('https://drafts.csswg.org/css-align-3/')
    expect(negative.requiredAssertions).toContain('syntax-supported')
  })

  it('负向证据缺失、CSSOM接受声明或引擎升级都必须拒绝旧限制通过', async () => {
    const inventory = await loadInventory()
    const profile = registryWebProfile(inventory.utilities.find(item => item.root === 'justify-baseline')!, 0)
    const limit = registryWebLimit(profile, 'chromium', 'linux')!
    const observation: RegistryObservation = { id: profile.id, styles: { 'justify-content': 'end' }, childStyles: [], pseudoStyles: {}, geometry: [0, 0, 96, 64, 96, 64], unavailableProperties: [], declarationEvidence: [{ property: limit.property, value: limit.value, supported: false, cssom: '' }] }
    const assertions = (reference = observation, version = limit.browserVersion, emitted = true) => registryLimitAssertions(limit, true, version, reference, observation, reference, emitted)
    expect(assertions().every(assertionPassed)).toBe(true)
    expect(assertions({ ...observation, declarationEvidence: [] }).every(assertionPassed)).toBe(false)
    expect(assertions({ ...observation, declarationEvidence: [{ property: limit.property, value: limit.value, supported: true, cssom: 'baseline' }] }).every(assertionPassed)).toBe(false)
    expect(assertions(observation, '157.0.0.0').every(assertionPassed)).toBe(false)
    expect(assertions({ ...observation, styles: { 'justify-content': 'baseline' } }).every(assertionPassed)).toBe(false)
    expect(assertions(observation, limit.browserVersion, false).every(assertionPassed)).toBe(false)
    expect(registryEmittedNegativeDeclaration('.justify-baseline { justify-content: baseline; }', profile, limit)).toBe(true)
    expect(registryEmittedNegativeDeclaration('.other { justify-content: baseline; } .justify-baseline { justify-content: end; }', profile, limit)).toBe(false)
    const fonts = registryWebProfile(inventory.utilities.find(item => item.root === 'antialiased')!, 0)
    const fontLimit = registryWebLimit(fonts, 'firefox', 'linux')!
    expect(registryEmittedNegativeDeclaration('.antialiased { -moz-osx-font-smoothing: grayscale; }', fonts, fontLimit)).toBe(false)
  })

  it('Firefox 仅滚动条宽度借用同库存原生 BiDi，保持后台模式和其他案例原协议', async () => {
    const inventory = await loadInventory()
    const profiles = inventory.utilities.map(registryWebProfile)
    expect(registryBidiProfiles('firefox', profiles).map(profile => profile.candidate)).toEqual(['scrollbar-auto', 'scrollbar-none', 'scrollbar-thin'])
    expect(registryBidiProfiles('chromium', profiles)).toEqual([])
    expect(registryBidiOptions('firefox-executable')).toEqual({ headless: true, channel: 'moz-firefox', executablePath: 'firefox-executable' })
  })

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
