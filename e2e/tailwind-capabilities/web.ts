import type { Browser, Page } from 'playwright'
import type { RunContext } from './context'
import type { BrowserEngine, CapabilityResult, SemanticAssertion } from './types'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium, firefox, webkit } from 'playwright'
import { newReport, persistReport } from './context'
import { withGeneratorFixture } from './fixture'
import { loadInventory } from './inventory'
import { assertionPassed, receipt, validateCapabilityReport, verifyReportArtifacts } from './report'
import { activateProbe, readProbe } from './web/actions'
import { renderWebProbe, webContract } from './web/contract'
import { webRuntimeCoverage } from './web/coverage'
import { pixelAssertions, readPixels } from './web/pixels'
import { webFixtureCss, webProbes } from './web/probes'

export { renderWebProbe, webContract } from './web/contract'
export { webRuntimeCoverage } from './web/coverage'
export { webFixtureCss, webProbes } from './web/probes'

export async function runWeb(context: RunContext, engine: BrowserEngine) {
  const probes = webProbes.filter(probe => !context.caseFilter || context.caseFilter.test(`runtime/${probe.id}`))
  if (!probes.length) {
    throw new Error('Web 运行时过滤条件没有匹配任何语义夹具')
  }
  const contracts = probes.map(webContract)
  const coverage = webRuntimeCoverage(await loadInventory())
  const report = await newReport(context, `web-${engine}`, contracts, { probes, css: webFixtureCss, coverage }, { engine, browserVersion: 'not-started', mode: 'independent-computed-style-state-and-pixels', fixtureDefinedFeatures: coverage.filter(item => item.status === 'fixture-defined').length, featuresWithoutRuntimeFixture: coverage.filter(item => item.status === 'not-run').length })
  await writeFile(path.join(context.directory, 'runtime-coverage.json'), `${JSON.stringify(coverage, null, 2)}\n`)
  if (contracts.length) {
    report.artifacts.push(await receipt(path.join(context.directory, 'runtime-coverage.json'), context.directory, context.runId, contracts.map(item => item.id), 'measurements'))
  }
  let browser: Browser | undefined
  let page: Page | undefined
  const errors: string[] = []
  try {
    browser = await { chromium, firefox, webkit }[engine].launch({ headless: true })
    report.environment.browserVersion = browser.version()
    const browserContext = await browser.newContext({ viewport: { width: 640, height: 480 }, colorScheme: 'light', reducedMotion: 'reduce' })
    page = await browserContext.newPage()
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(message.text())
      }
    })
    await withGeneratorFixture(context.root, webFixtureCss, {}, async (generator) => {
      const candidates = [...new Set(probes.flatMap(probe => probe.candidate.match(/\S+/g) ?? []))]
      const generated = await generator.generate({ target: 'web', candidates, scanSources: false })
      const cssFile = path.join(context.directory, 'generated.css')
      await writeFile(cssFile, generated.css)
      if (contracts.length) {
        report.artifacts.push(await receipt(cssFile, context.directory, context.runId, contracts.map(item => item.id), 'css'))
      }
      for (const probe of probes) {
        const id = `runtime/${probe.id}`
        const artifacts: string[] = ['generated.css']
        const measurements: unknown[] = []
        const assertions: SemanticAssertion[] = [{ name: 'generated', stage: 'generation', actual: (probe.candidate.match(/\S+/g) ?? []).every(candidate => generated.classSet.has(candidate)), expected: true }]
        const startError = errors.length
        const observe = async (state: string, expected: string) => {
          const observation = await readProbe(page!, probe)
          measurements.push({ state, property: probe.property, expected, ...observation })
          assertions.push({ name: state, stage: 'runtime', actual: observation.actual, expected })
          const name = `${probe.id}-${state}.png`
          const screenshot = await page!.screenshot({ path: path.join(context.directory, name), fullPage: true, scale: 'css' })
          if (probe.pixels?.length) {
            const pixels = readPixels(screenshot, observation.rect, probe.pixels, observation.scroll)
            measurements.push({ state, pixels })
            assertions.push(...pixelAssertions(probe.pixels, pixels))
          }
          artifacts.push(name)
          report.artifacts.push(await receipt(path.join(context.directory, name), context.directory, context.runId, [id], 'screenshot'))
        }
        let result: CapabilityResult
        let restore: (() => Promise<void>) | undefined
        try {
          await page!.mouse.move(0, 0)
          await page!.setViewportSize({ width: 640, height: 480 })
          await page!.emulateMedia({ colorScheme: 'light' })
          const html = renderWebProbe(probe)
          await page!.setContent(`<!doctype html><html lang="en"><head><meta charset="UTF-8"><style>${generated.css}</style></head><body><main class="stage">${html}</main></body></html>`)
          if (probe.action) {
            await observe('before', probe.before!)
            restore = await activateProbe(page!, probe)
            await observe('after', probe.expected)
            await restore()
            restore = undefined
            await observe('restored', probe.before!)
          }
          else {
            await observe('computed', probe.expected)
          }
          const passed = assertions.every(assertionPassed) && errors.length === startError
          result = { id, status: passed ? 'passed' : 'failed', support: 'supported', assertions, warnings: errors.slice(startError), artifacts, ...(!passed ? { reason: '实际 computed style 或状态前后恢复与独立预期不符' } : {}) }
        }
        catch (error) {
          measurements.push({ error: error instanceof Error ? error.stack : String(error) })
          result = { id, status: 'failed', support: 'supported', assertions, warnings: errors.slice(startError), artifacts, reason: error instanceof Error ? error.message : String(error) }
        }
        finally {
          if (restore) {
            try {
              await restore()
            }
            catch (error) {
              const reason = `状态恢复失败：${error instanceof Error ? error.message : String(error)}`
              measurements.push({ cleanupError: reason })
              result!.status = 'failed'
              result!.reason = reason
            }
          }
        }
        const measurementName = `${probe.id}.json`
        await writeFile(path.join(context.directory, measurementName), `${JSON.stringify({ id, engine, browserVersion: browser!.version(), measurements }, null, 2)}\n`)
        report.artifacts.push(await receipt(path.join(context.directory, measurementName), context.directory, context.runId, [id], 'measurements'))
        result.artifacts.push(measurementName)
        report.results.push(result)
      }
    })
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    const completed = new Set(report.results.map(item => item.id))
    for (const contract of contracts.filter(item => !completed.has(item.id))) {
      report.results.push({ id: contract.id, status: 'blocked', support: 'supported', assertions: [], warnings: [], artifacts: [], reason })
    }
  }
  finally {
    try {
      await browser?.close()
    }
    catch (error) {
      const reason = `本任务 ${engine} 浏览器关闭失败：${error instanceof Error ? error.message : String(error)}`
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
