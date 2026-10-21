import type { Browser, BrowserContext, Page } from 'playwright'
import type { RunContext } from '../context'
import type { BrowserEngine, CapabilityResult } from '../types'
import type { AutofillSidecar } from './types'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { newReport, persistReport } from '../context'
import { withGeneratorFixture } from '../fixture'
import { digest } from '../identity'
import { assertionPassed, receipt, validateCapabilityReport, verifyReportArtifacts } from '../report'
import { bounded } from '../web-native-media/deadline'
import { autofillContract } from './contract'
import { autofillCss, autofillProbe, autofillScreenshot, autofillUrl, renderAutofill } from './fixtures'
import { observeAutofill } from './native'
import { replayAutofill } from './replay'

/** 借用完整 Chromium；临时隔离 context 与原生协议均由本 runner 收尾。 */
export async function runAutofillWeb(base: RunContext, engine: BrowserEngine, browser: Browser) {
  if (engine !== 'chromium' || (base.caseFilter && !base.caseFilter.test(`runtime/${autofillProbe.id}`))) {
    throw new Error(`${engine} 没有匹配的原生 Autofill 夹具`)
  }
  const context = { ...base, directory: path.join(base.directory, 'autofill') }
  const contract = autofillContract(base.runId)
  const report = await newReport(context, 'web-chromium', [contract], { probe: autofillProbe, css: autofillCss, html: renderAutofill('GENERATED_CSS', 'RUN_ID') }, { engine, browserVersion: browser.version(), host: 'full-chromium', browserOwnership: 'borrowed', profile: 'owned-ephemeral-context', mode: 'native-autofill-standard-pseudo-outline-and-png' })
  const raw: AutofillSidecar = { schemaVersion: 2, id: contract.id, runId: base.runId, engine, browserVersion: browser.version(), host: 'full-chromium', observation: { timeline: [], commands: [], events: [], states: [], cleanup: { detached: false, errors: [] } }, warnings: [] }
  const artifacts: string[] = []
  let owned: BrowserContext | undefined
  let page: Page | undefined
  let reason: string | undefined
  const attach = async (name: string, kind: Parameters<typeof receipt>[4]) => {
    artifacts.push(name)
    report.artifacts.push(await receipt(path.join(context.directory, name), context.directory, base.runId, [contract.id], kind))
  }
  try {
    owned = await browser.newContext({ viewport: { width: 640, height: 540 }, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce', forcedColors: 'none' })
    page = await owned.newPage()
    page.setDefaultTimeout(5_000)
    page.setDefaultNavigationTimeout(5_000)
    page.on('pageerror', error => raw.warnings.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') {
        raw.warnings.push(message.text())
      }
    })
    await withGeneratorFixture(context.root, autofillCss, {}, async (generator) => {
      const output = await generator.generate({ target: 'web', candidates: [autofillProbe.candidate], scanSources: false })
      raw.generation = { cssHash: digest(output.css), candidates: [...output.classSet] }
      await writeFile(path.join(context.directory, 'generated.css'), output.css)
      await attach('generated.css', 'css')
      const url = autofillUrl(base.runId)
      await page!.route('**/*', route => route.request().url() === url ? route.fulfill({ status: 200, contentType: 'text/html', body: renderAutofill(output.css, base.runId) }) : route.abort())
      await page!.goto(url, { waitUntil: 'load' })
      await observeAutofill(page!, raw.observation, async (state) => {
        const name = autofillScreenshot(state)
        await page!.screenshot({ path: path.join(context.directory, name), fullPage: true, scale: 'css' })
        await attach(name, 'screenshot')
        return name
      }, base.runId, raw.generation.cssHash)
    })
  }
  catch (error) {
    reason = String(error)
  }
  finally {
    try {
      await bounded('关闭 Autofill 临时 context', async () => {
        await owned?.close()
      })
    }
    catch (error) {
      reason = `Autofill context 关闭失败：${String(error)}${reason ? `；${reason}` : ''}`
      report.environment['cleanupError'] = reason
    }
  }
  if (reason) {
    raw.error = reason
  }
  await writeFile(path.join(context.directory, 'measurements.json'), `${JSON.stringify(raw, null, 2)}\n`)
  await attach('measurements.json', 'measurements')
  let assertions: CapabilityResult['assertions'] = []
  try {
    const replay = await replayAutofill(context.directory, base.runId, browser.version())
    assertions = replay.assertions
    reason ??= replay.error
  }
  catch (error) {
    reason = `${reason ? `${reason}；` : ''}Autofill 原始证据复读失败：${String(error)}`
    await writeFile(path.join(context.directory, 'replay-error.json'), `${JSON.stringify({ runId: base.runId, error: reason }, null, 2)}\n`)
    await attach('replay-error.json', 'log')
  }
  const passed = !reason && !raw.warnings.length && assertions.length > 0 && assertions.every(assertionPassed)
  report.results.push({ id: contract.id, support: 'supported', status: passed ? 'passed' : 'failed', assertions, artifacts, warnings: raw.warnings, ...(!passed ? { reason: reason ?? 'Autofill 原生事件、字段、标准伪类、outline 像素或恢复不满足独立预期。' } : {}) })
  validateCapabilityReport(report, [contract], report.identity, base.runId, 'web-chromium')
  await verifyReportArtifacts(report, context.directory)
  await persistReport(context, report, [contract])
  return report
}
