import type { NativeCaseResult, NativePlatformReport, StaticEvidenceReport } from '../examples/react-lynx/src/compatibility/types'
import { describe, expect, it, vi } from 'vitest'
import { candidateCheckpoint, combineCandidateEvidence } from '../examples/react-lynx/src/compatibility/candidate-evidence'
import { compatibilityCases } from '../examples/react-lynx/src/compatibility/catalog'
import { lynxEvidenceStrategy } from '../examples/react-lynx/src/compatibility/evidence'
import staticEvidenceJson from '../examples/react-lynx/src/compatibility/static-evidence.json'
import { compatibilityVersions, getCatalogHash } from './lynx/catalog'
import { assertReviewedLynxOutcome, reviewedLynxSupport } from './lynx/expectations'
import { assertNativeConclusionsMatch } from './lynx/report-comparison'
import { nativeReportConclusion, validateNativeReport } from './lynx/reports'

vi.mock('../examples/react-lynx/src/compatibility/static-evidence.json', async (importOriginal) => {
  const original = await importOriginal<{ default: StaticEvidenceReport }>()
  const { compatibilityCases } = await import('../examples/react-lynx/src/compatibility/catalog')
  return { default: { ...original.default, results: original.default.results.map(result => ({
    ...result,
    candidates: compatibilityCases.find(item => item.id === result.id)!.className.split(/\s+/).map(className => ({ className, generated: result.generated, bundled: result.bundled })),
  })) } }
})

const staticById = new Map((staticEvidenceJson as StaticEvidenceReport).results.map(item => [item.id, item]))

function validResult(item: typeof compatibilityCases[number]): NativeCaseResult {
  const staticResult = staticById.get(item.id)!
  if (!staticResult.generated || (!staticResult.bundled && item.evidence !== 'build')) {
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
  const strategy = lynxEvidenceStrategy(item)
  const checkpoint = strategy === 'build'
    ? 'build:bundled'
    : strategy === 'native-geometry' || strategy === 'pixel-geometry'
      ? 'geometry:probe-vs-control'
      : strategy === 'interaction'
        ? 'interaction:progress'
        : 'pixel:probe-vs-control'
  const status = reviewedLynxSupport[item.id]![0]
  return { id: item.id, status, ...(status === 'unsupported' ? { reason: '已审查的 iOS 平台限制' } : {}), checkpoints: [{ name: checkpoint, passed: true }] }
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
  function pendingReport() {
    const value = report()
    const item = compatibilityCases.find(item => item.id === 'variant-state')!
    const built = staticById.get(item.id)!
    const active = built.candidates!.find(candidate => candidate.className.startsWith('active:'))!.className
    Object.assign(value.results.find(result => result.id === item.id)!, combineCandidateEvidence(item, built, [{
      className: active,
      status: 'supported',
      checkpoints: [{ name: candidateCheckpoint(active), passed: true }],
    }]))
    return value
  }

  it('采集允许active完成与hover待测的合法mixed报告，最终基线验收仍拒绝', () => {
    const partial = pendingReport()
    expect(validateNativeReport(partial, 'ios', { allowPendingCandidates: true })).toBe(partial)
    expect(partial.results.find(result => result.id === 'variant-state')!.candidates!.map(candidate => candidate.status)).toEqual(['supported', 'not-tested'])
    expect(() => validateNativeReport(partial, 'ios')).toThrow(/no final runtime status/)
  })

  it('部分采集可独立保存待测清单，默认最终结论比较仍拒绝', () => {
    const actual = pendingReport()
    const expected = report()
    expect(assertNativeConclusionsMatch(actual, expected, { allowPendingCandidates: true })).toEqual([
      expect.objectContaining({ id: 'variant-state', className: expect.stringContaining('hover:'), reason: expect.stringContaining('独立状态') }),
    ])
    expect(() => assertNativeConclusionsMatch(actual, expected)).toThrow(/不能比较或更新最终基线/)
  })

  it.each(['completed-case', 'metadata', 'invalid-partial'] as const)('部分采集不能掩盖 %s 漂移', (mode) => {
    const actual = pendingReport()
    const expected = report()
    if (mode === 'completed-case') {
      actual.results[0]!.status = 'unsupported'
    }
    if (mode === 'metadata') {
      actual.versions = { ...actual.versions, lynxEngine: 'wrong' }
    }
    if (mode === 'invalid-partial') {
      actual.results.find(item => item.id === 'variant-state')!.checkpoints.at(-1)!.passed = true
    }
    expect(() => assertNativeConclusionsMatch(actual, expected, { allowPendingCandidates: true })).toThrow()
  })

  it.each(['missing-candidate', 'wrong-input-proof', 'false-complete', 'false-supported', 'unrelated-case'] as const)('采集也拒绝 %s 的伪partial报告', (mode) => {
    const partial = pendingReport()
    const result = partial.results.find(result => result.id === 'variant-state')!
    if (mode === 'missing-candidate') {
      result.candidates!.pop()
    }
    if (mode === 'wrong-input-proof') {
      result.candidates![1]!.checkpoints = [{ name: 'interaction:pseudo-active', passed: false }]
    }
    if (mode === 'false-complete') {
      result.checkpoints.at(-1)!.passed = true
    }
    if (mode === 'false-supported') {
      result.status = 'supported'
    }
    if (mode === 'unrelated-case') {
      partial.results[0]!.status = 'not-tested'
    }
    expect(() => validateNativeReport(partial, 'ios', { allowPendingCandidates: true, requireCandidateEvidence: true })).toThrow()
  })

  it('已审查支持的案例失败不能自动降级为 unsupported', () => {
    const invalid = report()
    Object.assign(invalid.results.find(item => item.id === 'layout-aspect')!, { status: 'unsupported', reason: '本轮 encoder 异常删除 aspect-ratio' })
    expect(() => validateNativeReport(invalid, 'ios')).toThrow(/已审查支持预期 supported/)
  })

  it('已审查的平台限制也不能在缺少显式审查时自动改成支持', () => {
    const invalid = report()
    Object.assign(invalid.results.find(item => item.id === 'layout-columns')!, { status: 'supported', reason: undefined })
    expect(() => validateNativeReport(invalid, 'ios')).toThrow(/已审查支持预期 unsupported/)
  })

  it('generation 回归或错误阶段失败不能冒充已审查的 encoder 限制', () => {
    const built = staticById.get('layout-columns')!
    const result = validResult(compatibilityCases.find(item => item.id === built.id)!)
    expect(() => assertReviewedLynxOutcome(result, 'ios', { ...built, generated: false })).toThrow(/generation 回归/)
    expect(() => assertReviewedLynxOutcome(result, 'ios', { ...built, bundled: true })).toThrow(/失败阶段偏离/)
  })
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

  it('supports 的历史像素差异不能替代当前几何取证', () => {
    const invalid = report()
    invalid.results.find(item => item.id === 'variant-supports')!.checkpoints = [{ name: 'pixel:probe-vs-control', passed: true }]
    expect(() => validateNativeReport(invalid, 'ios')).toThrow(/variant-supports.*geometry:/)
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
