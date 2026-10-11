import { afterEach, describe, it } from 'vitest'

import { miniProgramCases, resolveAppHmrSteps, uniAppAppCases, uniAppXAppCases, webCases } from './hbuilderx-local/cases'
import { filterHBuilderXCases, parseCaseNameFilters } from './hbuilderx-local/filters'
import { hbuilderxAppTimeoutMs, hbuilderxTimeoutMs, killProcessTree, serverTimeoutMs } from './hbuilderx-local/process'
import { compileMiniProgramWithHBuilderX, verifyAppHmrWithHBuilderX, verifyWebHmr } from './hbuilderx-local/runner'
import { clearDevProcess, getDevProcess } from './hbuilderx-local/web'

const describeLocalHBuilderX = process.env['E2E_HBUILDERX_LOCAL'] === '1' ? describe : describe.skip
const caseGroupFilter = process.env['E2E_HBUILDERX_CASE_GROUP']
const caseNameFilters = parseCaseNameFilters(process.env['E2E_HBUILDERX_CASE'])
const appPlatformFilter = process.env['E2E_HBUILDERX_APP_PLATFORM']
const miniProgramPlatformFilters = parseCaseNameFilters(process.env['E2E_HBUILDERX_MP_PLATFORM'])
const allAppCases = [...uniAppAppCases, ...uniAppXAppCases]
const appCases = appPlatformFilter
  ? allAppCases.filter(item => item.platform === appPlatformFilter)
  : allAppCases
const miniProgramCasesByPlatform = miniProgramPlatformFilters.length > 0
  ? miniProgramCases.filter(item => miniProgramPlatformFilters.includes(item.platform))
  : miniProgramCases
const filteredMiniProgramCases = filterHBuilderXCases(miniProgramCasesByPlatform, caseNameFilters)
const filteredWebCases = filterHBuilderXCases(webCases, caseNameFilters)
const filteredAppCases = filterHBuilderXCases(appCases, caseNameFilters)
const miniProgramTest = !caseGroupFilter || caseGroupFilter === 'mp' ? it : it.skip
const appTest = !caseGroupFilter || caseGroupFilter === 'app' ? it : it.skip
const webTest = !caseGroupFilter || caseGroupFilter === 'web' ? it : it.skip
const miniProgramTestTimeoutMs = hbuilderxTimeoutMs * 2 + 30_000
const maxAppHmrSteps = Math.max(1, ...filteredAppCases.map(item => resolveAppHmrSteps(item).length))
const appTestTimeoutMs = hbuilderxAppTimeoutMs * (maxAppHmrSteps + 1) + 30_000

describeLocalHBuilderX('HBuilderX demo local e2e', () => {
  afterEach(() => {
    const devProcess = getDevProcess()
    if (devProcess) {
      killProcessTree(devProcess)
      clearDevProcess()
    }
  })

  miniProgramTest.each(filteredMiniProgramCases)('用 HBuilderX 编译小程序产物：$name', async (item) => {
    await compileMiniProgramWithHBuilderX(item)
  }, miniProgramTestTimeoutMs)

  appTest.each(filteredAppCases)('验证 HBuilderX uni-app App 开发态热更新产物：$name', async (item) => {
    await verifyAppHmrWithHBuilderX(item)
  }, appTestTimeoutMs)

  webTest.each(filteredWebCases)('验证 HBuilderX uni-app Web 页面和 HMR：$name', async (item) => {
    await verifyWebHmr(item)
  }, serverTimeoutMs * 2)
})
