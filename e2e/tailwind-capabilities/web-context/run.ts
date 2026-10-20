import type { Browser, BrowserContext, Page } from 'playwright'
import type { RunContext } from '../context'
import type { BrowserEngine, CapabilityResult, SemanticAssertion } from '../types'
import type { ContextProfile } from './fixtures'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { newReport, persistReport } from '../context'
import { withGeneratorFixture } from '../fixture'
import { assertionPassed, receipt, validateCapabilityReport, verifyReportArtifacts } from '../report'
import { activateContextState } from './actions'
import { contextWebAssertions, contextWebContract } from './contract'
import { contextProfiles, contextWebFixtureCss, contextWebProbes, renderContextWebProbe } from './fixtures'
import { observeContextState } from './observe'

interface OwnedContext {
  profile: ContextProfile
  context: BrowserContext
  page?: Page
  errors: string[]
  fixture?: string
}

/** 借用调用者的同一个后台 browser，仅创建和清理本 runner 拥有的 context/page。 */
export async function runContextWeb(baseContext: RunContext, engine: BrowserEngine, browser: Browser) {
  const context = { ...baseContext, directory: path.join(baseContext.directory, 'context') }
  const probes = contextWebProbes.filter(probe => !context.caseFilter || context.caseFilter.test(`runtime/${probe.id}`))
  if (!probes.length) {
    throw new Error('上下文 Web 过滤条件没有匹配任何语义夹具')
  }
  const contracts = probes.map(contextWebContract)
  const profiles = [...new Set(probes.flatMap(probe => probe.steps.map(step => step.profile)))]
  const report = await newReport(context, `web-${engine}`, contracts, { probes, profiles: contextProfiles, css: contextWebFixtureCss }, { engine, browserVersion: browser.version(), mode: 'native-context-and-user-validity', browserOwnership: 'borrowed', contextProfiles: profiles.join(',') })
  const owned: OwnedContext[] = []
  const resources = new Map<ContextProfile, OwnedContext>()
  const unavailable = new Map<ContextProfile, unknown>()
  const acquire = async (profile: ContextProfile) => {
    if (unavailable.has(profile)) {
      throw unavailable.get(profile)
    }
    const existing = resources.get(profile)
    if (existing) {
      return existing
    }
    let entry: OwnedContext
    try {
      entry = { profile, context: await browser.newContext({ viewport: { width: 640, height: 480 }, colorScheme: 'light', reducedMotion: 'reduce', ...contextProfiles[profile] }), errors: [] }
      // context 创建后立即登记，newPage 失败也必须清理。
      owned.push(entry)
      entry.page = await entry.context.newPage()
    }
    catch (error) {
      unavailable.set(profile, error)
      throw error
    }
    entry.page.on('pageerror', error => entry.errors.push(error.message))
    entry.page.on('console', (message) => {
      if (message.type() === 'error') {
        entry.errors.push(message.text())
      }
    })
    resources.set(profile, entry)
    return entry
  }
  try {
    await withGeneratorFixture(context.root, contextWebFixtureCss, {}, async (generator) => {
      const generated = await generator.generate({ target: 'web', candidates: probes.map(probe => probe.candidate), scanSources: false })
      const cssName = 'generated.css'
      await writeFile(path.join(context.directory, cssName), generated.css)
      report.artifacts.push(await receipt(path.join(context.directory, cssName), context.directory, context.runId, contracts.map(contract => contract.id), 'css'))
      for (const probe of probes) {
        const id = `runtime/${probe.id}`
        const assertions: SemanticAssertion[] = [{ name: 'generated', stage: 'generation', actual: generated.classSet.has(probe.candidate), expected: true }]
        const artifacts = [cssName]
        const measurements: unknown[] = []
        const warnings: string[] = []
        let result: CapabilityResult
        let currentPage: Page | undefined
        try {
          for (const step of probe.steps) {
            const resource = await acquire(step.profile)
            const page = resource.page!
            currentPage = page
            const startError = resource.errors.length
            if (resource.fixture !== probe.id) {
              await page.setContent(renderContextWebProbe(probe, generated.css), { waitUntil: 'load' })
              resource.fixture = probe.id
            }
            await activateContextState(page, step.action, step.profile)
            const observation = await observeContextState(page, step)
            measurements.push({ state: step.name, profile: step.profile, options: contextProfiles[step.profile], expected: step.expected, ...observation })
            assertions.push(...contextWebAssertions(step, observation.values))
            const screenshot = `${probe.id}-${step.name}.png`
            await page.screenshot({ path: path.join(context.directory, screenshot), fullPage: true, scale: 'css' })
            artifacts.push(screenshot)
            report.artifacts.push(await receipt(path.join(context.directory, screenshot), context.directory, context.runId, [id], 'screenshot'))
            warnings.push(...resource.errors.slice(startError))
          }
          const passed = assertions.every(assertionPassed) && !warnings.length
          result = { id, status: passed ? 'passed' : 'failed', support: 'supported', assertions, artifacts, warnings, ...(!passed ? { reason: '浏览器上下文、原生事件生命周期或实际样式不满足独立预期。' } : {}) }
        }
        catch (error) {
          const reason = error instanceof Error ? error.message : String(error)
          measurements.push({ error: error instanceof Error ? error.stack : reason })
          if (currentPage) {
            try {
              const screenshot = `${probe.id}-failure.png`
              await currentPage.screenshot({ path: path.join(context.directory, screenshot), fullPage: true, scale: 'css' })
              artifacts.push(screenshot)
              report.artifacts.push(await receipt(path.join(context.directory, screenshot), context.directory, context.runId, [id], 'screenshot'))
            }
            catch (screenshotError) {
              warnings.push(`失败截图未完成：${String(screenshotError)}`)
            }
          }
          result = { id, status: 'failed', support: 'supported', assertions, artifacts, warnings, reason }
        }
        const name = `${probe.id}.json`
        await writeFile(path.join(context.directory, name), `${JSON.stringify({ id, engine, browserVersion: browser.version(), measurements }, null, 2)}\n`)
        report.artifacts.push(await receipt(path.join(context.directory, name), context.directory, context.runId, [id], 'measurements'))
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
    const cleanupErrors: string[] = []
    for (const entry of owned.reverse()) {
      try {
        await entry.context.close()
      }
      catch (error) {
        cleanupErrors.push(`${entry.profile}: ${String(error)}`)
      }
    }
    if (cleanupErrors.length) {
      const reason = `本任务 context 清理失败：${cleanupErrors.join('；')}`
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
