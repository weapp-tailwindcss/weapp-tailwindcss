import type { CapabilityReport, CaseContract, TailwindTarget } from './types'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { capabilityIdentity } from './identity'

export interface RunContext {
  root: string
  directory: string
  runId: string
  startedAt?: string
  caseFilter?: RegExp
  env?: NodeJS.ProcessEnv
}

export async function newReport(context: RunContext, target: TailwindTarget, contracts: readonly CaseContract[], fixture: unknown, environment: CapabilityReport['environment']): Promise<CapabilityReport> {
  if (!contracts.length) {
    throw new Error(`${target} 过滤条件没有匹配任何案例`)
  }
  await mkdir(context.directory, { recursive: true })
  return { schemaVersion: 2, runId: context.runId, target, observedAt: context.startedAt ?? new Date().toISOString(), identity: await capabilityIdentity(context.root, contracts, { target, fixture }), environment, results: [], artifacts: [] }
}

export function targetContext(context: RunContext, target: string): RunContext {
  return { ...context, directory: path.join(context.directory, target), startedAt: new Date().toISOString() }
}

/** 把本轮合同和实际分层证据一并落盘，供统一 coverage 体系消费。 */
export async function persistReport(context: RunContext, report: CapabilityReport, contracts: readonly CaseContract[]) {
  const { writeCapabilityReport } = await import('./report')
  await writeCapabilityReport(path.join(context.directory, 'report.json'), report)
  await writeFile(path.join(context.directory, 'contracts.json'), `${JSON.stringify(contracts, null, 2)}\n`)
  const { capabilityCoverageEvidence, createTailwindCoverageCells } = await import('./coverage')
  const evidence = await capabilityCoverageEvidence(report, contracts, { expected: report.identity, runId: context.runId, target: report.target, repositoryRoot: context.root, artifactRoot: context.directory })
  await writeFile(path.join(context.directory, 'coverage.json'), `${JSON.stringify({ schemaVersion: 2, runId: context.runId, registry: createTailwindCoverageCells(report.target, contracts), evidence }, null, 2)}\n`)
}
