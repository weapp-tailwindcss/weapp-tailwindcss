import type { Browser, BrowserContext, Page } from 'playwright'
import type { RunContext } from '../context'
import type { BrowserEngine, CapabilityResult, SemanticAssertion } from '../types'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { newReport, persistReport } from '../context'
import { withGeneratorFixture } from '../fixture'
import { assertionPassed, receipt, validateCapabilityReport, verifyReportArtifacts } from '../report'
import { lifecycleAssertions, lifecycleWebContract } from './contract'
import { observeDetailsContent } from './details'
import { lifecycleFixtureUrl, lifecycleWebFixtureCss, lifecycleWebProbes, renderLifecycleProbe } from './fixtures'
import { observeStarting, startingObserverDefinition } from './starting'

/** 借用统一入口的后台 Browser，仅创建并清理本 runner 的 context/page。 */
export async function runLifecycleWeb(baseContext: RunContext, engine: BrowserEngine, browser: Browser) {
  const context = { ...baseContext, directory: path.join(baseContext.directory, 'lifecycle') }
  const probes = lifecycleWebProbes.filter(probe => !context.caseFilter || context.caseFilter.test(`runtime/${probe.id}`))
  if (!probes.length) {
    throw new Error('生命周期 Web 过滤条件没有匹配语义夹具')
  }
  const contracts = probes.map(probe => lifecycleWebContract(probe, context.runId))
  const fixture = { css: lifecycleWebFixtureCss, probes, html: probes.map(probe => renderLifecycleProbe(probe, 'GENERATED_CSS', 'RUN_ID')), observers: { starting: startingObserverDefinition(), details: observeDetailsContent.toString() } }
  const report = await newReport(context, `web-${engine}`, contracts, fixture, { engine, browserVersion: browser.version(), mode: 'native-transition-and-details-lifecycle', browserOwnership: 'borrowed' })
  let ownedContext: BrowserContext | undefined
  let page: Page | undefined
  const pageErrors: string[] = []
  let activeUrl = ''
  let activeHtml = ''
  try {
    ownedContext = await browser.newContext({ viewport: { width: 640, height: 480 }, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'no-preference' })
    page = await ownedContext.newPage()
    page.on('pageerror', error => pageErrors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') {
        pageErrors.push(message.text())
      }
    })
    await page.route('**/*', route => route.request().url() === activeUrl ? route.fulfill({ status: 200, contentType: 'text/html', body: activeHtml }) : route.abort())
    await withGeneratorFixture(context.root, lifecycleWebFixtureCss, {}, async (generator) => {
      const generated = await generator.generate({ target: 'web', candidates: probes.map(probe => probe.candidate), scanSources: false })
      await writeFile(path.join(context.directory, 'generated.css'), generated.css)
      report.artifacts.push(await receipt(path.join(context.directory, 'generated.css'), context.directory, context.runId, contracts.map(contract => contract.id), 'css'))
      for (const probe of probes) {
        const contract = contracts.find(contract => contract.id === `runtime/${probe.id}`)!
        const artifacts = ['generated.css']
        const measurements: unknown[] = []
        let assertions: SemanticAssertion[] = [{ name: 'generated', stage: 'generation', actual: generated.classSet.has(probe.candidate), expected: true }]
        let result: CapabilityResult
        const startErrors = pageErrors.length
        const capture = async (stage: string) => {
          const name = `${probe.id}-${stage}.png`
          const bytes = await page!.screenshot({ path: path.join(context.directory, name), fullPage: true, scale: 'css', animations: 'allow' })
          report.artifacts.push(await receipt(path.join(context.directory, name), context.directory, context.runId, [contract.id], 'screenshot'))
          artifacts.push(name)
          return bytes
        }
        try {
          activeUrl = lifecycleFixtureUrl(context.runId, probe.id)
          activeHtml = renderLifecycleProbe(probe, generated.css, context.runId)
          await page!.goto(activeUrl, { waitUntil: 'load' })
          const observation = probe.id === 'lifecycle-starting' ? await observeStarting(page!, context.runId, capture) : await observeDetailsContent(page!, context.runId, capture)
          measurements.push(observation)
          assertions = lifecycleAssertions(contract, observation, generated.classSet.has(probe.candidate))
          const warnings = pageErrors.slice(startErrors)
          const passed = assertions.every(assertionPassed) && !warnings.length
          result = { id: contract.id, status: passed ? 'passed' : 'failed', support: 'supported', assertions, artifacts, warnings, ...(!passed ? { reason: '原生生命周期、事件、恢复或实际像素未满足独立预期。' } : {}) }
        }
        catch (error) {
          measurements.push({ error: error instanceof Error ? error.stack : String(error), journal: await page!.evaluate(() => Reflect.get(globalThis, '__tailwindLifecycle')).catch(journalError => ({ error: String(journalError) })) })
          const warnings = pageErrors.slice(startErrors)
          try {
            await capture('failure')
          }
          catch (screenshotError) {
            warnings.push(`失败截图未完成：${String(screenshotError)}`)
          }
          result = { id: contract.id, status: 'failed', support: 'supported', assertions, artifacts, warnings, reason: String(error) }
        }
        const name = `${probe.id}.json`
        await writeFile(path.join(context.directory, name), `${JSON.stringify({ id: contract.id, runId: context.runId, url: activeUrl, engine, browserVersion: browser.version(), measurements }, null, 2)}\n`)
        report.artifacts.push(await receipt(path.join(context.directory, name), context.directory, context.runId, [contract.id], 'measurements'))
        result.artifacts.push(name)
        report.results.push(result)
      }
    })
  }
  catch (error) {
    const completed = new Set(report.results.map(result => result.id))
    for (const contract of contracts.filter(contract => !completed.has(contract.id))) {
      report.results.push({ id: contract.id, status: 'blocked', support: 'supported', assertions: [], warnings: [], artifacts: [], reason: String(error) })
    }
  }
  finally {
    try {
      await ownedContext?.close()
    }
    catch (error) {
      const reason = `生命周期 context 清理失败：${String(error)}`
      report.environment.cleanupError = reason
      for (const result of report.results) {
        result.status = 'failed'
        result.reason = reason
      }
    }
  }
  validateCapabilityReport(report, contracts, report.identity, context.runId, `web-${engine}`)
  await verifyReportArtifacts(report, context.directory)
  await persistReport(context, report, contracts)
  return report
}
