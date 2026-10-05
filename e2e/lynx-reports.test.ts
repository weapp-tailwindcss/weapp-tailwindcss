import type { NativeCaseResult, NativePlatformReport, StaticEvidenceReport } from '../examples/react-lynx/src/compatibility/types'
import { describe, expect, it } from 'vitest'
import { compatibilityCases } from '../examples/react-lynx/src/compatibility/catalog'
import staticEvidenceJson from '../examples/react-lynx/src/compatibility/static-evidence.json'
import { compatibilityVersions, getCatalogHash } from './lynx/catalog'
import { nativeReportConclusion, validateNativeReport } from './lynx/reports'

const staticById = new Map((staticEvidenceJson as StaticEvidenceReport).results.map(item => [item.id, item]))

function validResult(item: typeof compatibilityCases[number]): NativeCaseResult {
  const staticResult = staticById.get(item.id)!
  if (!staticResult.generated || !staticResult.bundled) {
    return {
      id: item.id,
      status: 'unsupported',
      reason: staticResult.reason ?? 'static failure',
      checkpoints: [
        { name: 'generated', passed: staticResult.generated },
        { name: 'bundled', passed: staticResult.bundled },
      ],
    }
  }
  const checkpoint = item.evidence === 'build'
    ? 'build:bundled'
    : item.probe === 'geometry'
      ? 'geometry:probe-vs-control'
      : item.probe === 'interaction'
        ? 'interaction:progress'
        : 'pixel:probe-vs-control'
  return { id: item.id, status: 'supported', checkpoints: [{ name: checkpoint, passed: true }] }
}

function report(overrides: Partial<NativePlatformReport> = {}): NativePlatformReport {
  return {
    schemaVersion: 1,
    platform: 'ios',
    catalogHash: getCatalogHash(),
    verifiedAt: '2026-08-17T00:00:00.000Z',
    versions: compatibilityVersions,
    environment: {
      deviceName: 'iPhone 17 Pro',
      deviceModel: 'iPhone18,1',
      osName: 'iOS',
      osVersion: '26.5',
      osBuild: '23F77',
      runtimeIdentifier: 'com.apple.CoreSimulator.SimRuntime.iOS-26-5',
      abi: 'arm64',
      viewport: { width: 402, height: 874, pixelRatio: 3 },
    },
    results: compatibilityCases.map(validResult),
    ...overrides,
  }
}

describe('Lynx native report gate', () => {
  it('accepts one complete pinned report', () => {
    expect(validateNativeReport(report(), 'ios').results).toHaveLength(compatibilityCases.length)
  })

  it('原生 JSON 重排版本字段后仍能校验并序列化为相同结论', () => {
    const first = report()
    const reordered = report({
      versions: {
        engineVersion: compatibilityVersions.engineVersion,
        tailwindcss: compatibilityVersions.tailwindcss,
        cssDefines: compatibilityVersions.cssDefines,
        lynxEngine: compatibilityVersions.lynxEngine,
      },
    })
    expect(validateNativeReport(reordered, 'ios')).toBe(reordered)
    expect(JSON.stringify(nativeReportConclusion(reordered))).toBe(JSON.stringify(nativeReportConclusion(first)))
  })

  it('版本字段顺序不影响独立的结论比较入口', () => {
    const first = report()
    const reversed = report({ versions: Object.fromEntries(Object.entries(first.versions).reverse()) as NativePlatformReport['versions'] })
    expect(JSON.stringify(nativeReportConclusion(reversed))).toBe(JSON.stringify(nativeReportConclusion(first)))
  })

  it.each(Object.keys(compatibilityVersions))('仍拒绝错误或缺失的版本字段 %s', (key) => {
    const wrong = { ...compatibilityVersions, [key]: 'wrong' }
    const missing = Object.fromEntries(Object.entries(compatibilityVersions).filter(([name]) => name !== key))
    for (const versions of [wrong, missing]) {
      const invalid = report({ versions: versions as NativePlatformReport['versions'] })
      expect(() => validateNativeReport(invalid, 'ios')).toThrow(/versions do not match/)
      expect(JSON.stringify(nativeReportConclusion(invalid))).not.toBe(JSON.stringify(nativeReportConclusion(report())))
    }
  })

  it.each([null, [], '4.0.1', { ...compatibilityVersions, extra: '1.0.0' }].map(versions => [versions]))('拒绝非版本对象或多余字段 %j', (versions) => {
    expect(() => validateNativeReport(report({ versions: versions as NativePlatformReport['versions'] }), 'ios')).toThrow(/versions do not match/)
  })

  it('rejects stale catalogs, missing cases and incomplete checkpoints', () => {
    expect(() => validateNativeReport(report({ catalogHash: 'stale' }), 'ios')).toThrow(/stale/)
    expect(() => validateNativeReport(report({ results: [] }), 'ios')).toThrow(/every catalog case/)
    const invalid = report()
    invalid.results[0] = { ...invalid.results[0]!, checkpoints: [] }
    expect(() => validateNativeReport(invalid, 'ios')).toThrow(/no runtime checkpoint/)
  })

  it('rejects unresolved simulator metadata', () => {
    const invalid = report()
    invalid.environment.osVersion = 'unknown'
    expect(() => validateNativeReport(invalid, 'ios')).toThrow(/environment.osVersion/)
  })

  it('rejects untested cases and supported results with failed checkpoints', () => {
    const untested = report()
    untested.results[0] = {
      id: compatibilityCases[0]!.id,
      status: 'not-tested',
      reason: 'requires native input',
      checkpoints: [{ name: 'input', passed: false }],
    }
    expect(() => validateNativeReport(untested, 'ios')).toThrow(/no final runtime status/)

    const inconsistent = report()
    inconsistent.results[0] = {
      id: compatibilityCases[0]!.id,
      status: 'supported',
      checkpoints: [{ name: 'geometry:probe-vs-control', passed: false }],
    }
    expect(() => validateNativeReport(inconsistent, 'ios')).toThrow(/supported but contains a failed checkpoint/)
  })

  it('requires the checkpoint kind declared by the catalog probe', () => {
    const invalid = report()
    invalid.results[0] = {
      id: compatibilityCases[0]!.id,
      status: 'supported',
      checkpoints: [{ name: 'rendered', passed: true }],
    }
    expect(() => validateNativeReport(invalid, 'ios')).toThrow(/missing a geometry: checkpoint/)
  })

  it('compares conclusions without volatile diagnostics or simulator metadata', () => {
    const first = report()
    const second = report({
      verifiedAt: '2026-08-18T00:00:00.000Z',
      environment: {
        ...first.environment,
        osVersion: '26.6',
      },
    })
    second.results[0] = {
      ...second.results[0]!,
      checkpoints: second.results[0]!.checkpoints.map(checkpoint => ({
        ...checkpoint,
        actual: 'floating diagnostic changed',
      })),
    }
    expect(nativeReportConclusion(second)).toEqual(nativeReportConclusion(first))

    second.results[0] = { ...second.results[0]!, status: 'unsupported', reason: 'regression' }
    expect(nativeReportConclusion(second)).not.toEqual(nativeReportConclusion(first))
  })
})
