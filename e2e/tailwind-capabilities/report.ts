import type { ArtifactReceipt, CapabilityIdentity, CapabilityReport, CapabilityResult, CaseContract, SemanticAssertion, TailwindTarget } from './types'
import { readFile, realpath, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { digest } from './identity'

const sha256 = /^[a-f\d]{64}$/

export function assertionPassed(assertion: SemanticAssertion): boolean {
  if (assertion.tolerance !== undefined) {
    return Number.isFinite(assertion.tolerance) && assertion.tolerance >= 0
      && typeof assertion.actual === 'number' && Number.isFinite(assertion.actual)
      && typeof assertion.expected === 'number' && Number.isFinite(assertion.expected)
      && Math.abs(assertion.actual - assertion.expected) <= assertion.tolerance
  }
  return assertion.actual !== null && assertion.actual === assertion.expected
}

function fail(message: string): never {
  throw new Error(`Tailwind 能力报告：${message}`)
}

export function validateCapabilityReport(report: CapabilityReport, contracts: readonly CaseContract[], expected: CapabilityIdentity, runId: string, expectedTarget: TailwindTarget) {
  if (!contracts.length || !report.results.length) {
    fail('过滤条件没有匹配案例，空报告不能验收')
  }
  if (report.target !== expectedTarget || !expectedTarget) {
    fail('验证目标与调用者要求不匹配')
  }
  if (report.schemaVersion !== 2 || report.runId !== runId || !runId) {
    fail('报告版本或本轮 run ID 不匹配')
  }
  if (!Number.isFinite(Date.parse(report.observedAt)) || !Object.keys(report.environment).length) {
    fail('缺少实际验证时间或运行环境')
  }
  for (const field of ['sourceHash', 'lockfileHash', 'catalogHash', 'fixtureHash', 'expectationsHash'] as const) {
    if (!sha256.test(report.identity[field]) || report.identity[field] !== expected[field]) {
      fail(`${field} 已过期或不匹配`)
    }
  }
  if (digest(report.identity.versions) !== digest(expected.versions) || Object.values(report.identity.versions).some(value => !value || value === 'unknown')) {
    fail('实际依赖版本不匹配或未知')
  }
  const definitions = new Map(contracts.map(item => [item.id, item]))
  if (definitions.size !== contracts.length || report.results.length !== contracts.length) {
    fail('案例缺失或重复')
  }
  const seen = new Set<string>()
  const artifacts = new Map(report.artifacts.map(item => [item.path, item]))
  if (artifacts.size !== report.artifacts.length) {
    fail('产物回执重复')
  }
  for (const artifact of report.artifacts) {
    if (artifact.runId !== runId || !sha256.test(artifact.sha256) || artifact.byteLength <= 0 || !artifact.caseIds.length) {
      fail(`产物缺少本轮身份：${artifact.path}`)
    }
  }
  for (const result of report.results) {
    const contract = definitions.get(result.id)
    if (!contract || seen.has(result.id)) {
      fail(`未知或重复案例 ${result.id}`)
    }
    seen.add(result.id)
    if (!['passed', 'failed', 'blocked', 'not-run'].includes(result.status) || result.support !== contract.expectation.support) {
      fail(`${result.id} 擅自改变预期支持状态`)
    }
    if (result.status !== 'passed') {
      if (!result.reason) {
        fail(`${result.id} 未通过却没有原因`)
      }
      continue
    }
    if (contract.expectation.support === 'unsupported' && (!contract.expectation.reason || !result.reason)) {
      fail(`${result.id} 缺少平台限制说明`)
    }
    const checks = new Map(result.assertions.map(item => [item.name, item]))
    if (checks.size !== result.assertions.length || !contract.requiredAssertions.length) {
      fail(`${result.id} 缺少独立语义断言`)
    }
    for (const name of contract.requiredAssertions) {
      const assertion = checks.get(name)
      if (!assertion || !assertionPassed(assertion)) {
        fail(`${result.id} 缺少或未通过 ${name}`)
      }
      if (!(name in contract.expectedValues) || assertion.expected !== contract.expectedValues[name]) {
        fail(`${result.id} 擅自改变 ${name} 的语义预期`)
      }
      if (assertion.tolerance !== contract.tolerances?.[name]) {
        fail(`${result.id} 擅自改变 ${name} 的允许误差`)
      }
      if (assertion.stage !== (contract.assertionStages?.[name] ?? contract.expectation.stage)) {
        fail(`${result.id} 用其它层级证据替代 ${contract.assertionStages?.[name] ?? contract.expectation.stage}`)
      }
    }
    if (result.assertions.some(item => !assertionPassed(item))) {
      fail(`${result.id} 含失败断言却声明通过`)
    }
    if (!result.assertions.some(item => item.stage === contract.expectation.stage)) {
      fail(`${result.id} 用其它层级证据替代 ${contract.expectation.stage}`)
    }
    if (!result.artifacts.length) {
      fail(`${result.id} 没有本轮原始证据`)
    }
    for (const file of result.artifacts) {
      const artifact = artifacts.get(file)
      if (!artifact?.caseIds.includes(result.id)) {
        fail(`${result.id} 产物不属于本案例：${file}`)
      }
    }
    const stages = new Set([contract.expectation.stage, ...contract.requiredAssertions.map(name => contract.assertionStages?.[name] ?? contract.expectation.stage)])
    if ((stages.has('runtime') || stages.has('hmr')) && !result.artifacts.some(file => artifacts.get(file)?.kind === 'measurements')) {
      fail(`${result.id} 缺少实际运行时测量`)
    }
    if ((stages.has('visual') || stages.has('hmr')) && !result.artifacts.some(file => artifacts.get(file)?.kind === 'screenshot')) {
      fail(`${result.id} 缺少实际截图`)
    }
  }
  return report
}

export function assertCapabilitySuccess(report: CapabilityReport) {
  if (!report.results.length) {
    fail('空报告不能验收')
  }
  const incomplete = report.results.filter(item => item.status !== 'passed')
  if (incomplete.length) {
    fail(`${incomplete.length} 项尚未通过：${incomplete.slice(0, 10).map(item => `${item.id} (${item.status}: ${item.reason})`).join('；')}`)
  }
}

export async function receipt(file: string, root: string, runId: string, caseIds: string[], kind: ArtifactReceipt['kind']): Promise<ArtifactReceipt> {
  const bytes = await readFile(file)
  return { path: path.relative(root, file), sha256: digest(bytes), byteLength: bytes.byteLength, runId, caseIds, kind }
}

export async function verifyReportArtifacts(report: CapabilityReport, root: string) {
  const canonicalRoot = await realpath(root)
  for (const item of report.artifacts) {
    const file = await realpath(path.resolve(root, item.path))
    const relative = path.relative(canonicalRoot, file)
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      fail(`产物越过本轮目录：${item.path}`)
    }
    const bytes = await readFile(file)
    const metadata = await stat(file)
    if (metadata.mtimeMs + 1 < Date.parse(report.observedAt)) {
      fail(`产物早于本轮执行：${item.path}`)
    }
    if (metadata.size !== item.byteLength || digest(bytes) !== item.sha256) {
      fail(`产物摘要不匹配：${item.path}`)
    }
  }
}

export async function writeCapabilityReport(file: string, report: CapabilityReport) {
  if (path.extname(file) !== '.json') {
    fail('报告文件必须使用 .json 扩展名')
  }
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`)
  const counts = (status: CapabilityResult['status']) => report.results.filter(item => item.status === status).length
  const lines = ['# Tailwind CSS 能力验证', '', `目标：${report.target}；run ID：${report.runId}`, '', `通过 ${counts('passed')}，失败 ${counts('failed')}，阻塞 ${counts('blocked')}，未执行 ${counts('not-run')}。`, '', '| 案例 | 支持预期 | 本轮结果 | 原因 |', '| --- | --- | --- | --- |', ...report.results.map(item => `| ${item.id} | ${item.support} | ${item.status} | ${(item.reason ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`), '']
  await writeFile(file.replace(/\.json$/, '.md'), lines.join('\n'))
}
