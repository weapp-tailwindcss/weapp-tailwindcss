import type { NativePlatformReport } from '../../examples/react-lynx/src/compatibility/types'
import type { RunContext } from './context'
import type { LynxTarget } from './lynx/contracts'
import type { CapabilityResult } from './types'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { newReport, persistReport } from './context'
import { lynxAdapterFixture, lynxCaseContracts } from './lynx/contracts'
import { lynxArtifactReceipts } from './lynx/evidence'
import { validateLynxCase } from './lynx/validate'
import { receipt, validateCapabilityReport, verifyReportArtifacts, writeCapabilityReport } from './report'

export { lynxCaseContracts } from './lynx/contracts'

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

/** 保留本轮原生产物，按独立契约重算；无法完整验证的案例形成明确阻塞报告。 */
export async function buildLynxCapabilityReport(context: RunContext, target: LynxTarget, raw: NativePlatformReport | undefined, validationError?: unknown) {
  const contracts = lynxCaseContracts(target, context.caseFilter)
  const report = await newReport(context, target, contracts, lynxAdapterFixture, {
    adapter: 'lynx-native-v2',
    ...(raw ? { platform: raw.platform, deviceName: raw.environment?.deviceName ?? 'unresolved', osVersion: raw.environment?.osVersion ?? 'unresolved', runtimeIdentifier: raw.environment?.runtimeIdentifier ?? 'unresolved' } : {}),
  })
  if (raw) {
    report.identity.versions = { ...report.identity.versions, ...raw.versions }
  }
  let invalid = validationError === undefined ? undefined : `原生运行或完整报告验证失败：${message(validationError)}`
  let incomplete = !raw ? '本轮没有生成可验证的 Lynx 原始报告' : undefined
  if (raw && !invalid) {
    try {
      if (raw.schemaVersion !== 1 || raw.platform !== target.slice('lynx-'.length)) {
        throw new Error('Lynx 原始报告目标与调用目标不一致')
      }
      report.artifacts = await lynxArtifactReceipts(context, raw, contracts)
      await verifyReportArtifacts(report, context.directory)
    }
    catch (error) {
      incomplete = `原始证据无法独立验证：${message(error)}`
      report.artifacts = []
    }
  }
  for (const contract of contracts) {
    if (contract.fixture === 'missing-lynx-atomic-runtime-fixture') {
      report.results.push({ id: contract.id, support: contract.expectation.support, status: 'not-run', assertions: [], artifacts: [], warnings: [], reason: '尚无此原子能力的独立 Lynx 运行时夹具；混合案例的整体支持或拒绝不能传播为该能力结论。' })
      continue
    }
    let outcome: Pick<CapabilityResult, 'status' | 'assertions' | 'reason'> = { status: invalid ? 'failed' : 'blocked', assertions: [], reason: invalid ?? incomplete }
    if (!invalid && !incomplete && raw) {
      try {
        outcome = await validateLynxCase(context, raw, contract)
      }
      catch (error) {
        outcome = { status: 'blocked', assertions: [], reason: `本案例语义证据无效：${message(error)}` }
      }
    }
    report.results.push({
      id: contract.id,
      support: contract.expectation.support,
      ...outcome,
      warnings: [],
      artifacts: report.artifacts.filter(item => item.caseIds.includes(contract.id)).map(item => item.path),
    })
  }
  const log = path.join(context.directory, 'lynx-adapter.log')
  await writeFile(log, `${report.results.map(item => `${item.id}: ${item.status}${item.reason ? ` — ${item.reason}` : ''}`).join('\n')}\n`)
  report.artifacts.push(await receipt(log, context.directory, context.runId, contracts.map(item => item.id), 'log'))
  // 出错也先写报告，调用者随后以 assertCapabilitySuccess 阻断任务。
  const output = path.join(context.directory, 'report.json')
  await writeCapabilityReport(output, report)
  try {
    validateCapabilityReport(report, contracts, report.identity, context.runId, target)
    await verifyReportArtifacts(report, context.directory)
  }
  catch (error) {
    invalid = `统一报告或原始产物复核失败：${message(error)}`
    report.results = report.results.map(item => ({ ...item, status: 'failed', reason: invalid, assertions: [] }))
    await writeCapabilityReport(output, report)
  }
  await persistReport(context, report, contracts)
  return { report, contracts }
}
