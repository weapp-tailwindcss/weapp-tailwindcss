import { describe, expect, it } from 'vitest'
import { COVERAGE_LAYERS, COVERAGE_REGISTRY, validateCoverageRegistry } from './coverageRegistry'
import { createCoverageReport, validateCoverageReport, validateReleaseCertificate } from './coverageReport'

const testIdentity = {
  commitSha: 'a'.repeat(40),
  treeSha: 'b'.repeat(40),
  lockfileSha: 'c'.repeat(64),
  registryHash: 'd'.repeat(64),
  catalogHashes: { 'react-native': 'e'.repeat(64), 'lynx': 'f'.repeat(64) },
  toolchain: { node: 'v22.12.0', pnpm: '10.0.0', runnerOs: 'linux' },
}

describe('多端 coverage registry contract', () => {
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
