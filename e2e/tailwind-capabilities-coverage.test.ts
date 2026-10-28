import type { CapabilityIdentity, CapabilityReport, CaseContract } from './tailwind-capabilities/types'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { validateCoverageRegistry } from './coverageRegistry'
import { filesystemObservedAt } from './tailwind-capabilities/artifact-clock'
import { capabilityCoverageEvidence, createTailwindCoverageCells } from './tailwind-capabilities/coverage'
import { receipt } from './tailwind-capabilities/report'

const directories: string[] = []
afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})
const identity: CapabilityIdentity = {
  sourceHash: 'a'.repeat(64),
  lockfileHash: 'b'.repeat(64),
  catalogHash: 'c'.repeat(64),
  fixtureHash: 'd'.repeat(64),
  expectationsHash: 'e'.repeat(64),
  versions: { tailwindcss: '4.3.3' },
}
const contract: CaseContract = { id: 'display-flex', features: ['display'], candidate: 'flex', fixture: 'view', expectation: { support: 'supported', stage: 'generation' }, requiredAssertions: ['declaration'], expectedValues: { declaration: 'flex' } }

async function fixture(contracts = [contract]) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capability coverage '))
  directories.push(root)
  const observedAt = filesystemObservedAt(root)
  const file = path.join(root, 'raw.css')
  await fs.writeFile(file, '.flex { display: flex }')
  const artifact = await receipt(file, root, 'run-one', contracts.map(item => item.id), 'css')
  const report: CapabilityReport = {
    schemaVersion: 2,
    runId: 'run-one',
    target: 'web-chromium',
    observedAt,
    identity,
    environment: { browser: 'chromium' },
    artifacts: [artifact],
    results: contracts.map(item => ({ id: item.id, status: 'passed', support: item.expectation.support, warnings: [], artifacts: [artifact.path], assertions: [{ name: 'declaration', stage: 'generation', actual: 'flex', expected: 'flex' }] })),
  }
  return { root, report, options: { expected: identity, runId: report.runId, target: report.target, repositoryRoot: root, artifactRoot: root } }
}

it('只有 generation 的案例只填充 static，并保持独立案例和浏览器身份', async () => {
  const { report, options } = await fixture()
  const registry = createTailwindCoverageCells(report.target, [contract])
  expect(() => validateCoverageRegistry(registry)).not.toThrow()
  expect(registry[0]).toMatchObject({ caseId: 'display-flex', capabilityIds: ['display'], browserEngine: 'chromium' })
  expect(registry[0]!.layers.runtime.status).toBe('not-applicable')
  expect(await capabilityCoverageEvidence(report, [contract], options)).toMatchObject([{ layer: 'static', status: 'passed' }])
})

it('Date 超前时本轮合成产物仍有效，旧产物继续拒绝', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(Date.now() + 60_000)
  const { root, report, options } = await fixture()
  expect(await capabilityCoverageEvidence(report, [contract], options)).toMatchObject([{ layer: 'static', status: 'passed' }])
  const old = new Date(Date.parse(report.observedAt) - 60_000)
  await fs.utimes(path.join(root, 'raw.css'), old, old)
  await expect(capabilityCoverageEvidence(report, [contract], options)).rejects.toThrow('早于本轮')
})

it('runtime 失败保留失败，不用先前生成成功补齐运行时覆盖', async () => {
  const runtime: CaseContract = { ...contract, expectation: { support: 'supported', stage: 'runtime' }, requiredAssertions: ['layout'], expectedValues: { layout: true } }
  const { report, options } = await fixture([runtime])
  report.results[0] = { ...report.results[0]!, status: 'failed', reason: '缺少原生布局', assertions: [] }
  expect(await capabilityCoverageEvidence(report, [runtime], options)).toMatchObject([{ layer: 'runtime', status: 'failed', reason: '缺少原生布局' }])
})

it('运行时契约不接受仅生成断言的通过报告', async () => {
  const runtime: CaseContract = { ...contract, expectation: { support: 'supported', stage: 'runtime' } }
  const { report, options } = await fixture([runtime])
  await expect(capabilityCoverageEvidence(report, [runtime], options)).rejects.toThrow(/其它层级证据/)
})

it('显式预期的编码限制只登记静态及负向证据，不成为运行时支持', async () => {
  const rejected: CaseContract = { ...contract, expectation: { support: 'unsupported', stage: 'encoding', reason: '原生不接受 checked selector' }, requiredAssertions: ['rejection'], expectedValues: { rejection: true } }
  const { report, options } = await fixture([rejected])
  report.results[0] = { ...report.results[0]!, reason: rejected.expectation.reason, assertions: [{ name: 'rejection', stage: 'encoding', actual: true, expected: true }] }
  expect(await capabilityCoverageEvidence(report, [rejected], options)).toMatchObject([{ layer: 'static', status: 'passed' }, { layer: 'negative', status: 'unsupported' }])
})

it('历史身份或已被改写的原始产物不能转换成通过覆盖', async () => {
  const { root, report, options } = await fixture()
  await expect(capabilityCoverageEvidence(report, [contract], { ...options, runId: 'different' })).rejects.toThrow(/run ID/)
  await expect(capabilityCoverageEvidence(report, [contract], { ...options, target: 'web-webkit' })).rejects.toThrow(/目标平台或浏览器/)
  await fs.writeFile(path.join(root, 'raw.css'), 'stale contents')
  await expect(capabilityCoverageEvidence(report, [contract], options)).rejects.toThrow(/摘要不匹配/)
})
