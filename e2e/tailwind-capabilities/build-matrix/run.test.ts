import type { RunContext } from '../context'
import type { CapabilityReport } from '../types'
import path from 'node:path'
import process from 'node:process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runWithCleanup } from '../../../scripts/e2e-preflight/cleanup'
import { MULTIPLATFORM_BUILD_OUTPUT_CASES } from '../../multiplatform-build-output/cases'
import { isMiniProgramTarget } from '../../multiplatform-build-output/helpers'
import { newReport, persistReport } from '../context'
import { assertCapabilitySuccess, validateCapabilityReport, verifyReportArtifacts } from '../report'
import { runStageProducer } from '../stage-receipt'
import { buildMatrixContracts, executeBuildMatrixCase } from './cases'
import { buildMatrixFixtures, resolveBuildMatrixCases, selectBuildMatrixCases, verifyMatrixProvider } from './providers'
import { BuildMatrixSchedule } from './schedule'
import { buildMatrixVersions } from './versions'

const directory = process.env['TAILWIND_E2E_MATRIX_DIRECTORY']
const runId = process.env['TAILWIND_E2E_RUN_ID']
if (!directory || !runId || process.env['E2E_MULTIPLATFORM_BUILD_SKIP_BUILD'] === '1') {
  throw new Error('多平台能力验收需要统一入口的本轮目录、run ID，并且必须实际构建')
}
const context: RunContext = { root: path.resolve(import.meta.dirname, '../../..'), directory, runId, startedAt: new Date().toISOString() }
const cases = selectBuildMatrixCases(resolveBuildMatrixCases(MULTIPLATFORM_BUILD_OUTPUT_CASES.filter(isMiniProgramTarget)), process.env['E2E_MULTIPLATFORM_BUILD_CASE'], process.env['E2E_MULTIPLATFORM_BUILD_STATUS'] ?? 'all')
const contracts = buildMatrixContracts(cases)
let report: CapabilityReport | undefined
let initializationError: unknown
const schedule = new BuildMatrixSchedule()

describe('Tailwind 各小程序平台构建与样式产物', () => {
  beforeAll(async () => {
    try {
      report = await newReport(context, 'mini-builds', contracts, buildMatrixFixtures(cases), { provider: 'multiplatform-build-output + hbuilderx-mini', runtime: false })
      report.identity.versions = { ...report.identity.versions, ...await buildMatrixVersions(context.root, cases) }
    }
    catch (error) {
      initializationError = error
      throw error
    }
  })

  it.each(cases)('$name', async (item) => {
    const observed = await schedule.execute(() => executeBuildMatrixCase(context, item, selected => verifyMatrixProvider(selected, context.root), (blocked) => {
      report!.results.push(blocked.result)
      report!.artifacts.push(...blocked.artifacts)
    }))
    if (!observed) {
      return
    }
    report!.results.push(observed.result)
    report!.artifacts.push(...observed.artifacts)
    for (const [tool, version] of Object.entries(observed.versions ?? {})) {
      report!.identity.versions[`${item.projectDir}:${item.platform}:${tool}`] = version
    }
    expect(observed.result.status, observed.result.reason).not.toBe('failed')
  }, 1_200_000)

  afterAll(async () => {
    await runStageProducer('mini-builds', async () => {
      await schedule.settle()
      return runWithCleanup(async () => {
        if (initializationError || schedule.blocked) {
          throw initializationError ?? schedule.blocked
        }
      }, async () => {
        if (!report) {
          throw new Error('小程序矩阵初始化失败，没有本轮报告')
        }
        const completed = new Set(report.results.map(item => item.id))
        for (const contract of contracts.filter(item => !completed.has(item.id))) {
          report.results.push({ id: contract.id, status: 'not-run', support: 'supported', reason: schedule.blocked ? '前置宿主环境阻断，本项目未启动' : '本轮调度未执行到此项目', assertions: [], artifacts: [], warnings: [] })
        }
        await persistReport(context, report, contracts)
        validateCapabilityReport(report, contracts, report.identity, runId, 'mini-builds')
        await verifyReportArtifacts(report, directory)
        assertCapabilitySuccess(report)
      })
    })
  }, 120_000)
})
