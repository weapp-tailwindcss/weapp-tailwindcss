import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { COVERAGE_LAYERS, COVERAGE_REGISTRY, validateCoverageRegistry } from './coverageRegistry'
import { createCoverageReport, readCommittedCompatibilityEvidence, validateCoverageReport, validateReleaseCertificate } from './coverageReport'

const testIdentity = {
  commitSha: 'a'.repeat(40),
  treeSha: 'b'.repeat(40),
  lockfileSha: 'c'.repeat(64),
  registryHash: 'd'.repeat(64),
  catalogHashes: { 'react-native': 'e'.repeat(64), 'lynx': 'f'.repeat(64) },
  toolchain: { node: 'v22.12.0', pnpm: '10.0.0', runnerOs: 'linux' },
}

describe('多端 coverage registry contract', () => {
  it('逐案例和浏览器登记范围，构建指令没有运行时、截图或开发态覆盖', () => {
    const web = COVERAGE_REGISTRY.filter(cell => cell.source === 'tailwind' && cell.caseId === 'layout-display')
    expect(web.map(cell => cell.platform).sort()).toEqual(['weapp', 'web-chromium', 'web-firefox', 'web-webkit'])
    for (const cell of COVERAGE_REGISTRY.filter(cell => cell.source !== 'demo')) {
      expect(cell.caseId).toBeTruthy()
      expect(cell.layers.dev.status).toBe('not-applicable')
      if (cell.caseId === 'directive-import') {
        expect(cell.layers.runtime.status).toBe('not-applicable')
        expect(cell.layers.visual.status).toBe('not-applicable')
      }
    }
  })

  it('历史 supported/unsupported JSON 不能扩张为本轮静态、运行时或截图证据', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'historical coverage '))
    try {
      const reportDirectory = path.join(directory, 'e2e', 'lynx', 'reports')
      await fs.mkdir(reportDirectory, { recursive: true })
      await fs.writeFile(path.join(reportDirectory, 'android.json'), JSON.stringify({
        schemaVersion: 1,
        verifiedAt: '2026-10-06T00:00:00Z',
        results: [{ id: 'layout-aspect', status: 'supported' }, { id: 'layout-columns', status: 'unsupported' }],
      }))
      const evidence = await readCommittedCompatibilityEvidence(directory)
      expect(evidence.length).toBeGreaterThan(0)
      expect(evidence.every(item => item.status === 'not-run' && item.reason?.includes('仅供历史展示'))).toBe(true)
      expect(evidence.some(item => item.layer === 'dev')).toBe(false)
      const report = createCoverageReport(evidence)
      expect(report.summary.passed).toBe(0)
      expect(report.summary.unsupported).toBe(0)
      expect(() => validateCoverageReport(report)).not.toThrow()
    }
    finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  })
  it('keeps every cell unique and every layer executable', () => {
    expect(COVERAGE_REGISTRY.length).toBeGreaterThan(109)
    expect(new Set(COVERAGE_REGISTRY.map(item => item.id)).size).toBe(COVERAGE_REGISTRY.length)
    expect(validateCoverageRegistry()).toBe(COVERAGE_REGISTRY)
    for (const cell of COVERAGE_REGISTRY) {
      for (const layer of COVERAGE_LAYERS) {
        expect(cell.layers[layer].executor, `${cell.id}:${layer}`).toBeTruthy()
        expect(cell.layers[layer].evidenceSchema, `${cell.id}:${layer}`).toBeTruthy()
      }
    }
  })

  it('requires an explicit normal dev contract for every demo platform', () => {
    for (const cell of COVERAGE_REGISTRY.filter(item => item.source === 'demo')) {
      const dev = cell.layers.dev
      expect(dev.executor, `${cell.id}:dev`).toBeTruthy()
      expect(dev.evidenceSchema, `${cell.id}:dev`).toBe('demo-dev-v1')
      if (dev.status === 'not-applicable' || dev.status === 'unsupported-verified') {
        expect(dev.reason, `${cell.id}:dev exemption should include a reason`).toBeTruthy()
      }
    }
  })

  it('does not treat blocked or not-run required cells as passing', () => {
    const report = createCoverageReport([], 'aggregate')
    expect(report.summary.requiredUnverified).toBeGreaterThan(0)
    expect(report.summary.coveragePercent).toBeLessThan(100)
    expect(() => validateCoverageReport({ ...report, source: 'ci' })).toThrow(/identity|required coverage/)
  })

  it('requires reasons for unsupported evidence and rejects unknown cells', () => {
    expect(() => createCoverageReport([{
      cellId: 'unknown',
      layer: 'negative',
      status: 'unsupported',
      executor: 'test',
      evidenceSchema: 'negative-v1',
      reason: 'unknown',
    }])).toThrow(/unknown cell/)
    const report = createCoverageReport([{
      cellId: 'react-native/web/layout-columns',
      layer: 'negative',
      status: 'unsupported',
      executor: 'pnpm e2e:react-native:web',
      evidenceSchema: 'react-native-negative-v1',
      reason: '明确不支持',
    }], 'aggregate')
    const item = report.cells.find(item => item.cellId === 'react-native/web/layout-columns' && item.layer === 'negative')
    expect(item).toBeDefined()
    const invalidCells = report.cells.map((current) => {
      if (current !== item) {
        return current
      }
      const { reason: _reason, ...withoutReason } = current
      return withoutReason
    })
    expect(() => validateCoverageReport({ ...report, cells: invalidCells })).toThrow(/requires reason/)
  })

  it('rejects duplicate or unknown evidence instead of silently overwriting it', () => {
    const evidence = {
      cellId: 'react-native/web/layout-columns',
      layer: 'negative' as const,
      status: 'unsupported' as const,
      executor: 'pnpm e2e:react-native:web',
      evidenceSchema: 'react-native-negative-v1',
      reason: '明确不支持',
    }
    expect(() => createCoverageReport([evidence, evidence], 'aggregate')).toThrow(/duplicate coverage evidence input/)
    expect(() => createCoverageReport([{ ...evidence, cellId: 'missing' }], 'aggregate')).toThrow(/unknown cell/)
  })

  it('requires a release certificate to be identity-bound, signed, and artifact-backed', () => {
    const registry = [{
      id: 'demo/test:web',
      source: 'demo' as const,
      project: 'test',
      framework: 'vue',
      builder: 'vite',
      tailwindcss: 'v4' as const,
      platform: 'web',
      runtime: 'web',
      renderMode: 'default' as const,
      subpackage: false,
      layers: Object.fromEntries(COVERAGE_LAYERS.map(layer => [layer, {
        status: layer === 'hmr' ? 'not-applicable' as const : 'ci-required' as const,
        executor: 'test',
        evidenceSchema: `${layer}-v1`,
        ...(layer === 'hmr' ? { reason: '测试单元不提供 HMR。' } : {}),
      }])) as typeof COVERAGE_REGISTRY[number]['layers'],
    }]
    const evidence = registry.flatMap(cell => COVERAGE_LAYERS.map(layer => ({
      cellId: cell.id,
      layer,
      status: layer === 'hmr' ? 'not-applicable' as const : 'passed' as const,
      executor: 'test',
      evidenceSchema: `${layer}-v1`,
      ...(layer === 'hmr'
        ? {}
        : {
            identity: testIdentity,
            artifactManifest: [{ path: 'package.json', sha256: '0'.repeat(64), kind: 'manifest' as const }],
          }),
    })))
    const report = createCoverageReport(evidence, 'ci', registry, {
      identity: testIdentity,
      requiredBy: 'release',
      signature: {
        algorithm: 'cosign-blob',
        identity: 'release@example.invalid',
        bundleSha256: '1'.repeat(64),
        verified: true,
      },
    })
    expect(() => validateReleaseCertificate(report, { ...testIdentity, commitSha: '0'.repeat(40) }, registry)).toThrow(/identity/)
    expect(() => validateReleaseCertificate({ ...report, signature: undefined }, testIdentity, registry)).toThrow(/signature/)
    expect(() => validateReleaseCertificate({ ...report, requiredBy: 'pr' }, testIdentity, registry)).toThrow(/requiredBy/)
    expect(() => validateReleaseCertificate({ ...report, cells: report.cells.map(item => item.layer === 'static' ? { ...item, artifactManifest: undefined } : item) }, testIdentity, registry)).toThrow(/artifact manifest/)
  })
})
