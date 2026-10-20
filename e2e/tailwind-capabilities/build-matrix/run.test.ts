import type { RunContext } from '../context'
import type { CapabilityReport } from '../types'
import path from 'node:path'
import process from 'node:process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getMultiplatformBuildOutputCases } from '../../multiplatform-build-output/cases'
import { isMiniProgramTarget } from '../../multiplatform-build-output/helpers'
import { verifyBuildOutputCase } from '../../multiplatform-build-output/runner'
import { newReport, persistReport } from '../context'
import { assertCapabilitySuccess, validateCapabilityReport, verifyReportArtifacts } from '../report'
import { buildMatrixContracts, executeBuildMatrixCase } from './cases'
import { buildMatrixVersions } from './versions'

const directory = process.env.TAILWIND_E2E_MATRIX_DIRECTORY
const runId = process.env.TAILWIND_E2E_RUN_ID
if (!directory || !runId || process.env.E2E_MULTIPLATFORM_BUILD_SKIP_BUILD === '1') {
  throw new Error('多平台能力验收需要统一入口的本轮目录、run ID，并且必须实际构建')
}
const context: RunContext = { root: path.resolve(import.meta.dirname, '../../..'), directory, runId, startedAt: new Date().toISOString() }
const cases = getMultiplatformBuildOutputCases().filter(isMiniProgramTarget)
const contracts = buildMatrixContracts(cases)
let report: CapabilityReport | undefined

describe('Tailwind 各小程序平台构建与样式产物', () => {
  beforeAll(async () => {
    report = await newReport(context, 'mini-builds', contracts, cases, { provider: 'multiplatform-build-output', runtime: false })
    report.identity.versions = { ...report.identity.versions, ...await buildMatrixVersions(context.root, cases) }
  })

  it.each(cases)('$name', async (item) => {
    const observed = await executeBuildMatrixCase(context, item, verifyBuildOutputCase)
    report!.results.push(observed.result)
    report!.artifacts.push(...observed.artifacts)
    expect(observed.result.status, observed.result.reason).not.toBe('failed')
  }, 1_200_000)

  afterAll(async () => {
    if (!report) {
      return
    }
    const completed = new Set(report.results.map(item => item.id))
    for (const contract of contracts.filter(item => !completed.has(item.id))) {
      report.results.push({ id: contract.id, status: 'not-run', support: 'supported', reason: '本轮调度未执行到此项目', assertions: [], artifacts: [], warnings: [] })
    }
    await persistReport(context, report, contracts)
    validateCapabilityReport(report, contracts, report.identity, runId, 'mini-builds')
    await verifyReportArtifacts(report, directory)
    assertCapabilitySuccess(report)
  }, 120_000)
})
