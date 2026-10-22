import type { Browser } from 'playwright'
import type { RunContext } from './context'
import type { BrowserEngine, CapabilityResult, SemanticAssertion } from './types'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { observeAuthoring } from './authoring-web/browser'
import { authoringMeasurementAssertions, authoringStates, authoringWebContract, authoringWebOutcome } from './authoring-web/contract'
import { authoringWebCoverage, authoringWebProfiles } from './authoring-web/profiles'
import { buildAuthoringReference } from './authoring-web/reference'
import { launchCapabilityBrowser } from './browser/launch'
import { newReport, persistReport } from './context'
import { cssDeclarations } from './css'
import { withGeneratorFixture } from './fixture'
import { receipt, validateCapabilityReport, verifyReportArtifacts } from './report'

export { authoringWebCoverage, authoringWebProfiles } from './authoring-web/profiles'

export async function runAuthoringWeb(context: RunContext, engine: BrowserEngine, borrowedBrowser?: Browser) {
  const profiles = authoringWebProfiles.filter(profile => !context.caseFilter || new RegExp(context.caseFilter.source, context.caseFilter.flags).test(profile.id))
  const contracts = profiles.map(authoringWebContract)
  const output = { ...context, directory: path.join(context.directory, 'authoring') }
  const coverage = authoringWebCoverage()
  const report = await newReport(output, `web-${engine}`, contracts, { profiles, coverage }, { engine, browserVersion: 'not-started', mode: 'authoring-isolated-reference', headless: true })
  const coverageName = 'authoring-coverage.json'
  await writeFile(path.join(output.directory, coverageName), `${JSON.stringify(coverage, null, 2)}\n`)
  report.artifacts.push(await receipt(path.join(output.directory, coverageName), output.directory, output.runId, profiles.map(profile => profile.id), 'measurements'))
  let browser: Browser | undefined
  let closeContext: (() => Promise<void>) | undefined
  const errors: string[] = []
  try {
    if (profiles.some(profile => !profile.reason)) {
      browser = borrowedBrowser ?? await launchCapabilityBrowser(engine)
      report.environment.browserVersion = browser.version()
      const browserContext = await browser.newContext({ viewport: { width: 960, height: 300 }, colorScheme: 'light', reducedMotion: 'reduce' })
      if (borrowedBrowser) {
        closeContext = () => browserContext.close()
      }
      const page = await browserContext.newPage()
      page.on('pageerror', error => errors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error') {
          errors.push(message.text())
        }
      })
      for (const profile of profiles.filter(profile => !profile.reason)) {
        const startErrors = errors.length
        const evidence: string[] = [coverageName]
        const measurements: unknown[] = []
        const assertions: SemanticAssertion[] = []
        let result: CapabilityResult
        try {
          const reference = await buildAuthoringReference(profile)
          if (reference) {
            const referenceName = `${profile.fixture.id}.reference.css`
            await writeFile(path.join(output.directory, referenceName), reference.css || '\n')
            report.artifacts.push(await receipt(path.join(output.directory, referenceName), output.directory, output.runId, [profile.id], 'css'))
            evidence.push(referenceName)
            measurements.push({ referenceIdentity: reference.identity })
          }
          await withGeneratorFixture(output.root, profile.fixture.css, profile.fixture.files, async (generator) => {
            // 源码扫描仍只消费隔离文件；渲染探针发生在生成之后，不把探针候选补回生成器。
            const generated = await generator.generate({ target: 'web', candidates: profile.fixture.candidates, scanSources: true })
            const parsed = cssDeclarations(generated.rawCss)
            assertions.push(
              { name: 'generated', stage: 'generation', actual: profile.groups.filter(group => !group.excluded).every(group => group.sourceCandidate ? generated.classSet.has(group.sourceCandidate) : parsed.bySelector.has(group.sourceSelector!)), expected: true },
              { name: 'excluded', stage: 'generation', actual: (profile.fixture.absentCandidates ?? []).every(candidate => !generated.classSet.has(candidate) && !parsed.byClass.has(candidate)), expected: true },
            )
            const cssName = `${profile.fixture.id}.css`
            await writeFile(path.join(output.directory, cssName), generated.css || '\n')
            report.artifacts.push(await receipt(path.join(output.directory, cssName), output.directory, output.runId, [profile.id], 'css'))
            evidence.push(cssName)
            for (const state of authoringStates(profile)) {
              const observed = await observeAuthoring(page, profile, generated.css, state, reference)
              measurements.push({ state, observed })
              assertions.push(...observed.flatMap(measurement => authoringMeasurementAssertions(state, measurement)))
              const screenshot = `${profile.fixture.id}-${state}.png`
              await page.screenshot({ path: path.join(output.directory, screenshot), fullPage: true, scale: 'css' })
              report.artifacts.push(await receipt(path.join(output.directory, screenshot), output.directory, output.runId, [profile.id], 'screenshot'))
              evidence.push(screenshot)
            }
          })
          assertions.push({ name: 'no-page-errors', stage: 'runtime', actual: errors.length === startErrors, expected: true })
          const status = authoringWebOutcome(assertions)
          result = { id: profile.id, status, support: 'supported', assertions, warnings: errors.slice(startErrors), artifacts: evidence, ...(status !== 'passed' ? { reason: status === 'not-run' ? '当前引擎的独立参考未建立可观测效果，不能用共同默认值验收。' : 'authoring 实际效果或条件前后恢复与独立预期不一致。' } : {}) }
        }
        catch (error) {
          result = { id: profile.id, status: 'failed', support: 'supported', assertions, warnings: errors.slice(startErrors), artifacts: evidence, reason: String(error) }
          measurements.push({ error: String(error) })
        }
        const measurement = `${profile.fixture.id}.json`
        await writeFile(path.join(output.directory, measurement), `${JSON.stringify({ id: profile.id, engine, browserVersion: browser.version(), profile, measurements }, null, 2)}\n`)
        report.artifacts.push(await receipt(path.join(output.directory, measurement), output.directory, output.runId, [profile.id], 'measurements'))
        result.artifacts.push(measurement)
        report.results.push(result)
      }
    }
  }
  catch (error) {
    const completed = new Set(report.results.map(result => result.id))
    for (const profile of profiles.filter(profile => !profile.reason && !completed.has(profile.id))) {
      report.results.push({ id: profile.id, status: 'blocked', support: 'supported', assertions: [], artifacts: [], warnings: [], reason: String(error) })
    }
  }
  finally {
    try {
      await (closeContext ? closeContext() : browser?.close())
    }
    catch (error) {
      report.environment.cleanupError = String(error)
      for (const result of report.results) {
        result.status = 'failed'
        result.reason = `本任务 authoring 浏览器关闭失败：${String(error)}`
      }
    }
  }
  for (const profile of profiles.filter(profile => profile.reason)) {
    report.results.push({ id: profile.id, status: 'not-run', support: 'supported', assertions: [], artifacts: [coverageName], warnings: [], reason: profile.reason })
  }
  validateCapabilityReport(report, contracts, report.identity, output.runId, `web-${engine}`)
  await verifyReportArtifacts(report, output.directory)
  await persistReport(output, report, contracts)
  return report
}
