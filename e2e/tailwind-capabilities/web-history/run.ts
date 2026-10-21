import type { BrowserType } from 'playwright'
import type { RunContext } from '../context'
import type { BrowserEngine, CapabilityResult } from '../types'
import type { HistorySidecar } from './types'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { newReport, persistReport } from '../context'
import { withGeneratorFixture } from '../fixture'
import { digest } from '../identity'
import { assertionPassed, receipt, validateCapabilityReport, verifyReportArtifacts } from '../report'
import { withHistoryCapture } from './capture'
import { historyContract } from './contract'
import { historyCss, historyObservation, historyProbe, historyReference, historyStates, renderHistory } from './fixtures'
import { captureHistory, historyPage, visitHistory } from './observe'
import { withHistoryProfile } from './profile'
import { replayHistory } from './replay'
import { historyServer } from './server'

/** 历史隔离需要两份自有 profile，串行关闭后再创建下一份，不触及用户历史。 */
export async function runHistoryWeb(base: RunContext, engine: BrowserEngine, browserType: BrowserType) {
  if (browserType.name() !== engine) {
    throw new Error('历史夹具实际 BrowserType 与目标引擎不匹配')
  }
  if (base.caseFilter && !base.caseFilter.test(`runtime/${historyProbe.id}`)) {
    throw new Error(`${engine} 没有匹配的历史运行时夹具`)
  }
  const context = { ...base, directory: path.join(base.directory, 'history') }
  const contract = historyContract(context.runId)
  const report = await newReport(context, `web-${engine}`, [contract], { probe: historyProbe, css: historyCss, reference: historyReference, states: historyStates, observation: historyObservation, html: renderHistory('GENERATED_CSS', 'RUN_ID') }, { engine, browserVersion: '', mode: 'native-http-history-and-png', browserOwnership: 'owned-persistent-profiles' })
  const raw: HistorySidecar = { schemaVersion: 3, id: contract.id, runId: context.runId, engine, browserVersion: '', origin: '', profiles: [], lifecycle: [], states: [], navigation: [], requests: [], cleanup: { closedProfiles: [], removedProfiles: [], serverClosed: false, errors: [] }, warnings: [], observationFailures: [] }
  const artifacts: string[] = []
  let reason: string | undefined
  let sequence = 0
  const next = () => ++sequence
  let server: Awaited<ReturnType<typeof historyServer>> | undefined
  try {
    await withGeneratorFixture(context.root, historyCss, {}, async (generator) => {
      const output = await generator.generate({ target: 'web', candidates: [historyProbe.candidate], scanSources: false })
      raw.generation = { candidates: [...output.classSet], cssHash: digest(output.css) }
      await writeFile(path.join(context.directory, 'generated.css'), output.css)
      artifacts.push('generated.css')
      report.artifacts.push(await receipt(path.join(context.directory, 'generated.css'), context.directory, context.runId, [contract.id], 'css'))
      server = await historyServer(output.css, context.runId, raw, next)
      await withHistoryProfile(browserType, engine, 'history', raw, async (owned, profile) => {
        const page = await historyPage(owned, raw)
        const capture = async (state: string, timeoutMs: number) => {
          const name = `${historyProbe.id}-${state}.png`
          const bytes = await page.screenshot({ path: path.join(context.directory, name), fullPage: true, scale: 'css', timeout: timeoutMs })
          artifacts.push(name)
          report.artifacts.push(await receipt(path.join(context.directory, name), context.directory, context.runId, [contract.id], 'screenshot'))
          return { file: name, bytes }
        }
        await withHistoryCapture(capture, async (capture) => {
          await captureHistory(page, 'initial', profile, raw, capture, next)
          await visitHistory(page, profile, raw, next)
          await captureHistory(page, 'visited', profile, raw, capture, next)
        })
      })
      await withHistoryProfile(browserType, engine, 'fresh', raw, async (owned, profile) => {
        const page = await historyPage(owned, raw)
        await withHistoryCapture(async (state, timeoutMs) => {
          const name = `${historyProbe.id}-${state}.png`
          const bytes = await page.screenshot({ path: path.join(context.directory, name), fullPage: true, scale: 'css', timeout: timeoutMs })
          artifacts.push(name)
          report.artifacts.push(await receipt(path.join(context.directory, name), context.directory, context.runId, [contract.id], 'screenshot'))
          return { file: name, bytes }
        }, capture => captureHistory(page, 'restored', profile, raw, capture, next))
      })
    })
  }
  catch (error) {
    reason = String(error)
  }
  finally {
    if (server) {
      try {
        await server.close()
      }
      catch (error) {
        const cleanup = `历史 HTTP 关闭失败：${String(error)}`
        raw.cleanup.errors.push(cleanup)
        reason = reason ? `${reason}；${cleanup}` : cleanup
      }
    }
  }
  report.environment['browserVersion'] = raw.browserVersion
  if (reason) {
    raw.error = reason
  }
  await writeFile(path.join(context.directory, 'measurements.json'), `${JSON.stringify(raw, null, 2)}\n`)
  artifacts.push('measurements.json')
  report.artifacts.push(await receipt(path.join(context.directory, 'measurements.json'), context.directory, context.runId, [contract.id], 'measurements'))
  let assertions: CapabilityResult['assertions'] = []
  try {
    const replay = await replayHistory(context.directory, context.runId, engine, raw.browserVersion)
    assertions = replay.assertions
    reason ??= replay.error
  }
  catch (error) {
    reason = `${reason ? `${reason}；` : ''}历史原始证据复读失败：${String(error)}`
  }
  const passed = !reason && !raw.warnings.length && assertions.length > 0 && assertions.every(assertionPassed)
  report.results.push({ id: contract.id, status: passed ? 'passed' : 'failed', support: 'supported', assertions, artifacts, warnings: raw.warnings, ...(!passed ? { reason: reason ?? '真实历史、四边像素、对照链接或全新 profile 恢复未满足独立预期。' } : {}) })
  validateCapabilityReport(report, [contract], report.identity, context.runId, `web-${engine}`)
  await verifyReportArtifacts(report, context.directory)
  await persistReport(context, report, [contract])
  return report
}
