import type { CapabilityReport } from './tailwind-capabilities/types'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { arbitrarySyntaxCases } from '../tools/tailwindcss-test-catalog/src'
import { loadDefaultDesignSystem, loadInventory } from './tailwind-capabilities/inventory'
import { assertionPassed, validateCapabilityReport } from './tailwind-capabilities/report'
import { autofillProbe } from './tailwind-capabilities/web-autofill/fixtures'
import { contextWebProbes } from './tailwind-capabilities/web-context/fixtures'
import { historyProbe } from './tailwind-capabilities/web-history/fixtures'
import { lifecycleWebProbes } from './tailwind-capabilities/web-lifecycle/fixtures'
import { nativeMediaProbe } from './tailwind-capabilities/web-native-media/fixtures'
import { renderWebProbe, webContract } from './tailwind-capabilities/web/contract'
import { webRuntimeCoverage } from './tailwind-capabilities/web/coverage'
import { webFeatureBindings } from './tailwind-capabilities/web/features'
import { pixelAssertionName, pixelAssertions, readPixels, rgbaChannels } from './tailwind-capabilities/web/pixels'
import { webProbes } from './tailwind-capabilities/web/probes'

describe('Web 语义夹具合同', () => {
  it('contrast-less 仅为具备原生媒体入口的 Chromium 登记夹具', async () => {
    const inventory = await loadInventory()
    for (const engine of ['chromium', 'firefox', 'webkit'] as const) {
      const row = webRuntimeCoverage(inventory, engine).find(item => item.featureId === 'variant/static/contrast-less')!
      expect(row.status, engine).toBe(engine === 'chromium' ? 'fixture-defined' : 'not-run')
      expect(row.caseIds).toEqual(engine === 'chromium' ? ['runtime/native-media-contrast-less'] : [])
      if (engine !== 'chromium') {
        expect(row.reason).toMatch(/运行时.*原生/)
      }
    }
  })

  it('每个状态场景固定独立前置、生效、恢复预期', () => {
    expect(new Set(webProbes.map(item => item.id)).size).toBe(webProbes.length)
    for (const probe of webProbes) {
      const contract = webContract(probe)
      const pixelNames = (probe.pixels ?? []).flatMap(sample => rgbaChannels.map(channel => pixelAssertionName(sample, channel)))
      expect(contract.expectedValues.generated).toBe(true)
      if (probe.action) {
        expect(probe.before, probe.id).toBeDefined()
        expect(contract.requiredAssertions.filter(name => ['generated', 'before', 'after', 'restored', ...(probe.checkpoints ?? []).map(item => item.name)].includes(name))).toEqual(['generated', 'before', ...(probe.checkpoints ?? []).map(item => item.name), 'after', 'restored'])
        expect(contract.expectedValues.before).toBe(contract.expectedValues.restored)
        expect(contract.expectedValues.after).toBe(probe.expected)
      }
      else {
        expect(contract.requiredAssertions.filter(name => ['generated', 'computed', ...pixelNames].includes(name))).toEqual(['generated', 'computed', ...pixelNames])
        expect(contract.expectedValues.computed).toBe(probe.expected)
      }
      expect(contract.assertionStages).toEqual({ generated: 'generation', ...Object.fromEntries(pixelNames.map(name => [name, 'visual'])) })
    }
  })

  it('引号和选择器不能破坏 HTML class 属性', () => {
    const pseudo = webProbes.find(item => item.id === 'pseudo-content')!
    expect(renderWebProbe(pseudo)).toContain('before:content-[&quot;probe&quot;]')
    expect(renderWebProbe(webProbes.find(item => item.id === 'arbitrary-selector')!)).toContain('[&amp;>span]')
    expect(() => renderWebProbe({ ...webProbes[0]!, action: 'hover' })).toThrow(/缺少/)
  })

  it('混合 variant 分别执行，且不从 CSS 产物推导视觉值', () => {
    for (const id of ['hover', 'active', 'focus', 'checked', 'dark', 'responsive', 'container', 'data', 'aria', 'group-hover', 'peer-checked', 'dynamic-class']) {
      expect(webProbes.find(item => item.id === id)?.action, id).toBeTruthy()
    }
    expect(webProbes.find(item => item.id === 'width')?.expected).toBe('123px')
    expect(webProbes.find(item => item.id === 'background')?.expected).toBe('rgb(18, 52, 86)')
  })

  it('运行时使用的每个精确候选都由锁定上游真实生成', async () => {
    const ds = await loadDefaultDesignSystem()
    for (const probe of webProbes) {
      for (const candidate of probe.candidate.match(/\S+/g) ?? []) {
        expect(ds.candidatesToCss([candidate])[0], `${probe.id}/${candidate}`).toBeTruthy()
      }
    }
  })

  it('每条注册能力明确绑定运行时夹具或保留未执行原因', async () => {
    const inventory = await loadInventory()
    const features = [...inventory.utilities, ...inventory.variants]
    const featureIds = new Set(features.map(item => item.id))
    const syntaxIds = new Set(arbitrarySyntaxCases.map(item => `syntax/${item.id}`))
    expect(Object.keys(webFeatureBindings).sort()).toEqual(webProbes.map(item => item.id).sort())
    for (const probe of webProbes) {
      expect(webContract(probe).features).toEqual(webFeatureBindings[probe.id])
      for (const feature of probe.features) {
        expect(featureIds.has(feature) || syntaxIds.has(feature) || feature === 'runtime/dynamic-class', `${probe.id}/${feature}`).toBe(true)
      }
    }
    const coverage = webRuntimeCoverage(inventory, 'chromium')
    expect(coverage.map(item => item.featureId).sort()).toEqual([...featureIds].sort())
    expect(new Set(coverage.map(item => item.featureId)).size).toBe(features.length)
    const probes: readonly { id: string, features: readonly string[] }[] = [...webProbes, ...contextWebProbes, ...lifecycleWebProbes, historyProbe, nativeMediaProbe, autofillProbe]
    for (const row of coverage) {
      const caseIds = probes.filter(item => item.features.includes(row.featureId)).map(item => `runtime/${item.id}`)
      expect(row.caseIds).toEqual(caseIds)
      expect(row.status).toBe(caseIds.length ? 'fixture-defined' : 'not-run')
      if (!caseIds.length) {
        expect(row.reason).toMatch(/尚未提供.*运行时/)
      }
    }
    expect(coverage.some(item => item.status === 'not-run')).toBe(true)
  })

  it('渐变截图颜色错误时，固定像素语义必须失败', () => {
    const probe = webProbes.find(item => item.id === 'gradient')!
    const samples = probe.pixels!
    const render = (reverse: boolean) => {
      const png = new PNG({ width: 100, height: 60 })
      for (let y = 0; y < png.height; y++) {
        for (let x = 0; x < png.width; x++) {
          const red = (x < png.width / 2) !== reverse
          png.data.set(red ? [255, 0, 0, 255] : [0, 0, 255, 255], (y * png.width + x) * 4)
        }
      }
      return PNG.sync.write(png)
    }
    const rect = { left: 0, top: 0, width: 100, height: 60 }
    const correct = pixelAssertions(samples, readPixels(render(false), rect, samples))
    const wrong = pixelAssertions(samples, readPixels(render(true), rect, samples))
    expect(correct.every(assertionPassed)).toBe(true)
    expect(wrong.every(assertionPassed)).toBe(false)
    const contract = webContract(probe)
    for (const assertion of correct) {
      expect(contract.assertionStages?.[assertion.name]).toBe('visual')
      expect(contract.expectedValues[assertion.name]).toBe(assertion.expected)
      expect(contract.tolerances?.[assertion.name]).toBe(2)
    }
    const hash = '0'.repeat(64)
    const identity = { sourceHash: hash, lockfileHash: hash, catalogHash: hash, fixtureHash: hash, expectationsHash: hash, versions: { tailwindcss: '4.3.3' } }
    const report: CapabilityReport = {
      schemaVersion: 2,
      runId: 'pixel-contract',
      target: 'web-chromium',
      observedAt: new Date().toISOString(),
      identity,
      environment: { engine: 'chromium' },
      results: [{ id: contract.id, status: 'passed', support: 'supported', assertions: [{ name: 'generated', stage: 'generation', actual: true, expected: true }, { name: 'computed', stage: 'runtime', actual: '100px', expected: '100px' }, ...wrong], artifacts: ['pixels.png', 'measurements.json'], warnings: [] }],
      artifacts: [{ path: 'pixels.png', sha256: hash, byteLength: 1, kind: 'screenshot', runId: 'pixel-contract', caseIds: [contract.id] }, { path: 'measurements.json', sha256: hash, byteLength: 1, kind: 'measurements', runId: 'pixel-contract', caseIds: [contract.id] }],
    }
    expect(() => validateCapabilityReport(report, [contract], identity, report.runId, 'web-chromium')).toThrow(/pixel/)
    expect(webProbes.find(item => item.id === 'shadow')?.pixels?.map(item => item.x)).toEqual([1.04, -0.04])
    expect(() => readPixels(render(false), rect, [{ ...samples[0]!, x: 2 }])).toThrow(/超出本轮截图/)
  })
})
