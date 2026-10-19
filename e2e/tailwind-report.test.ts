import type { CapabilityIdentity, CapabilityReport, CaseContract } from './tailwind-capabilities/types'
import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertCapabilitySuccess, receipt, validateCapabilityReport, verifyReportArtifacts } from './tailwind-capabilities/report'

const hash = 'a'.repeat(64)
const identity: CapabilityIdentity = { sourceHash: hash, lockfileHash: hash, catalogHash: hash, fixtureHash: hash, expectationsHash: hash, versions: { tailwindcss: '4.3.3' } }
const contracts: CaseContract[] = [{ id: 'width', features: ['functional/w'], candidate: 'w-[32px]', fixture: 'box', expectation: { support: 'supported', stage: 'runtime' }, requiredAssertions: ['width'], expectedValues: { width: 32 } }]

function validReport(): CapabilityReport {
  return { schemaVersion: 2, target: 'web-chromium', runId: 'current', observedAt: new Date().toISOString(), identity: structuredClone(identity), environment: { browser: '156' }, artifacts: [{ path: 'measurements.json', sha256: hash, byteLength: 20, kind: 'measurements', runId: 'current', caseIds: ['width'] }], results: [{ id: 'width', status: 'passed', support: 'supported', warnings: [], artifacts: ['measurements.json'], assertions: [{ name: 'width', stage: 'runtime', actual: 32, expected: 32 }] }] }
}

describe('Tailwind 四端语义证据合同', () => {
  it('接受当前源码、完整案例和准确语义的本轮证据', () => {
    expect(validateCapabilityReport(validReport(), contracts, identity, 'current', 'web-chromium').schemaVersion).toBe(2)
  })

  it('拒绝空案例与其它浏览器报告冒充本目标', () => {
    const empty = validReport()
    empty.results = []
    expect(() => validateCapabilityReport(empty, [], identity, 'current', 'web-chromium')).toThrow('空报告')
    expect(() => assertCapabilitySuccess(empty)).toThrow('空报告')
    expect(() => validateCapabilityReport(validReport(), contracts, identity, 'current', 'web-webkit')).toThrow('验证目标')
  })

  it('拒绝节点可见但实际宽度错误', () => {
    const report = validReport()
    report.results[0]!.assertions[0]!.actual = 2
    expect(() => validateCapabilityReport(report, contracts, identity, 'current', 'web-chromium')).toThrow('width')
  })

  it('拒绝通过篡改预期来掩盖错误样式', () => {
    const report = validReport()
    report.results[0]!.assertions[0] = { name: 'width', stage: 'runtime', actual: 2, expected: 2 }
    expect(() => validateCapabilityReport(report, contracts, identity, 'current', 'web-chromium')).toThrow('语义预期')
  })

  it('拒绝用构建层替代运行时证据', () => {
    const report = validReport()
    report.results[0]!.assertions[0]!.stage = 'generation'
    expect(() => validateCapabilityReport(report, contracts, identity, 'current', 'web-chromium')).toThrow('替代 runtime')
  })

  it('拒绝丢失部分预期属性', () => {
    const expanded = structuredClone(contracts)
    expanded[0]!.requiredAssertions.push('height')
    expanded[0]!.expectedValues.height = 40
    expect(() => validateCapabilityReport(validReport(), expanded, identity, 'current', 'web-chromium')).toThrow('height')
  })

  it('运行时合同包含视觉子断言时必须提供本例截图，测量文件不能代替', () => {
    const expanded = structuredClone(contracts)
    expanded[0]!.requiredAssertions.push('pixel')
    expanded[0]!.expectedValues.pixel = true
    expanded[0]!.assertionStages = { pixel: 'visual' }
    const report = validReport()
    report.results[0]!.assertions.push({ name: 'pixel', stage: 'visual', actual: true, expected: true })
    expect(() => validateCapabilityReport(report, expanded, identity, 'current', 'web-chromium')).toThrow('缺少实际截图')
    report.artifacts.push({ path: 'pixel.png', kind: 'screenshot', byteLength: 10, sha256: hash, runId: 'current', caseIds: ['width'] })
    report.results[0]!.artifacts.push('pixel.png')
    expect(validateCapabilityReport(report, expanded, identity, 'current', 'web-chromium')).toBe(report)
  })

  it('拒绝把预期支持静默改为平台不支持', () => {
    const report = validReport()
    report.results[0]!.support = 'unsupported'
    report.results[0]!.reason = '样式未生效'
    expect(() => validateCapabilityReport(report, contracts, identity, 'current', 'web-chromium')).toThrow('改变预期支持')
  })

  it('HMR 除实际测量还必须保存本例截图，不能只有成功消息', () => {
    const expanded = structuredClone(contracts)
    expanded[0]!.expectation.stage = 'hmr'
    const report = validReport()
    report.results[0]!.assertions[0]!.stage = 'hmr'
    expect(() => validateCapabilityReport(report, expanded, identity, 'current', 'web-chromium')).toThrow('缺少实际截图')
    report.artifacts.push({ path: 'hmr.png', kind: 'screenshot', byteLength: 10, sha256: hash, runId: 'current', caseIds: ['width'] })
    report.results[0]!.artifacts.push('hmr.png')
    expect(validateCapabilityReport(report, expanded, identity, 'current', 'web-chromium')).toBe(report)
    report.results[0]!.artifacts = ['hmr.png']
    expect(() => validateCapabilityReport(report, expanded, identity, 'current', 'web-chromium')).toThrow('缺少实际运行时测量')
  })

  it('拒绝放宽报告中的误差掩盖错误尺寸', () => {
    const report = validReport()
    report.results[0]!.assertions[0]!.actual = 2
    report.results[0]!.assertions[0]!.tolerance = 100
    expect(() => validateCapabilityReport(report, contracts, identity, 'current', 'web-chromium')).toThrow('允许误差')
  })

  it.each(['sourceHash', 'lockfileHash', 'catalogHash', 'fixtureHash', 'expectationsHash'] as const)('拒绝过期 %s', (key) => {
    const report = validReport()
    report.identity[key] = 'b'.repeat(64)
    expect(() => validateCapabilityReport(report, contracts, identity, 'current', 'web-chromium')).toThrow(key)
  })

  it('拒绝实际版本与登记版本不符', () => {
    const report = validReport()
    report.identity.versions.tailwindcss = '4.3.2'
    expect(() => validateCapabilityReport(report, contracts, identity, 'current', 'web-chromium')).toThrow('版本')
  })

  it('拒绝缺少案例、重复案例及历史回执', () => {
    const missing = validReport()
    missing.results = []
    expect(() => validateCapabilityReport(missing, contracts, identity, 'current', 'web-chromium')).toThrow('案例')
    const stale = validReport()
    stale.artifacts[0]!.runId = 'previous'
    expect(() => validateCapabilityReport(stale, contracts, identity, 'current', 'web-chromium')).toThrow('本轮身份')
  })

  it('拒绝把存在不支持说明当作负向验证', () => {
    const negative = structuredClone(contracts)
    negative[0]!.expectation = { support: 'unsupported', stage: 'negative', reason: '编码器拒绝 grid' }
    const report = validReport()
    report.results[0]!.support = 'unsupported'
    report.results[0]!.reason = '编码器拒绝 grid'
    expect(() => validateCapabilityReport(report, negative, identity, 'current', 'web-chromium')).toThrow('negative')
  })

  it('明确区分平台限制已验证、阻塞和未执行', () => {
    const report = validReport()
    report.results[0]!.status = 'blocked'
    report.results[0]!.reason = '设备不在线'
    expect(validateCapabilityReport(report, contracts, identity, 'current', 'web-chromium')).toBe(report)
    expect(() => assertCapabilitySuccess(report)).toThrow('设备不在线')
  })

  it('拒绝把旧截图重新签为本轮产物，以及截图被替换后的摘要', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'tailwind-report-regression-'))
    try {
      const file = path.join(directory, 'screenshot.png')
      await writeFile(file, 'old screenshot bytes')
      const report = validReport()
      report.artifacts = [await receipt(file, directory, 'current', ['width'], 'screenshot')]
      const old = new Date(Date.now() - 60_000)
      await utimes(file, old, old)
      await expect(verifyReportArtifacts(report, directory)).rejects.toThrow('早于本轮')
      await writeFile(file, 'different screenshot bytes')
      await expect(verifyReportArtifacts(report, directory)).rejects.toThrow('摘要不匹配')
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
