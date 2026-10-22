import type { Browser, BrowserContext, Page } from 'playwright'
import type { RunContext } from './context'
import type { FrameworkSourceObservation } from './framework-source/contract'
import type { FrameworkSourceProfile } from './framework-source/fixtures'
import type { BrowserEngine, SemanticAssertion } from './types'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { launchCapabilityBrowser } from './browser/launch'
import { observeBrowserErrors } from './browser/observer'
import { newReport, persistReport } from './context'
import { readFrameworkSource, saveFrameworkSourceAndSettle } from './framework-source/browser'
import { frameworkSourceContract, sourceCssAssertions, sourceRuntimeAssertions } from './framework-source/contract'
import { frameworkSource, frameworkSourceCss, frameworkSourceProfiles, sourceBranchStates, sourceFrameworks, sourceRevisions } from './framework-source/fixtures'
import { frameworkSourceResources } from './framework-source/resources'
import { withFrameworkSourceServer } from './framework-source/server'
import { assertionPassed, receipt, validateCapabilityReport, verifyReportArtifacts } from './report'

export { frameworkSourceProfiles } from './framework-source/fixtures'

export function frameworkSourceCoverage() {
  return frameworkSourceProfiles.map(profile => ({ id: profile.id, runtime: 'fixture-defined', runtimeScope: 'real-react-jsx-or-vue-sfc-execution', sourceExecution: profile.kind === 'interpolation-negative' ? 'dynamic-interpolation-remains-unscannable' : profile.kind, sourceScanning: 'isolated-source-file-only', sourceRevisions, branchStates: sourceBranchStates, hmrScope: 'source-mutation-with-refresh-only-generic-hmr-separate' }))
}

export async function runFrameworkSource(context: RunContext, engine: BrowserEngine, borrowedBrowser?: Browser) {
  const profiles = frameworkSourceProfiles.filter(profile => !context.caseFilter || new RegExp(context.caseFilter.source, context.caseFilter.flags).test(profile.id))
  const contracts = profiles.map(frameworkSourceContract)
  const output = { ...context, directory: path.join(context.directory, 'framework-source') }
  const fixtures = sourceFrameworks.map(framework => ({ framework, resources: frameworkSourceResources(framework, context.runId), css: frameworkSourceCss(framework), sources: sourceRevisions.map(revision => ({ revision, source: frameworkSource(framework, revision, context.runId) })) }))
  const report = await newReport(output, `web-${engine}`, contracts, { fixtures, profiles }, { engine, browserVersion: 'not-started', mode: 'real-framework-source-branches-and-refresh', headless: true })
  const errors: string[] = []
  const logs: string[] = []
  let browser: Browser | undefined
  let browserContext: BrowserContext | undefined
  let page: Page | undefined
  let browserEvidence: ReturnType<typeof observeBrowserErrors> | undefined
  let stage = 'framework:setup'
  const save = async (name: string, content: string | Uint8Array, kind: 'css' | 'bundle' | 'measurements' | 'screenshot' | 'log', owners: FrameworkSourceProfile[]) => {
    await writeFile(path.join(output.directory, name), content)
    report.artifacts.push(await receipt(path.join(output.directory, name), output.directory, output.runId, owners.map(profile => profile.id), kind))
    return name
  }
  const coverageName = await save('framework-source-coverage.json', JSON.stringify(frameworkSourceCoverage(), null, 2), 'measurements', profiles)
  try {
    browser = borrowedBrowser ?? await launchCapabilityBrowser(engine)
    report.environment.browserVersion = browser.version()
    browserContext = await browser.newContext({ viewport: { width: 640, height: 760 } })
    await browserContext.addInitScript(() => {
      if (location.protocol !== 'about:') {
        (globalThis as any).__frameworkSourceSession = crypto.randomUUID()
      }
    })
    page = await browserContext.newPage()
    for (const framework of sourceFrameworks) {
      const selected = profiles.filter(profile => profile.framework === framework)
      if (!selected.length) {
        continue
      }
      const assertions = new Map(selected.map(profile => [profile.id, [] as SemanticAssertion[]]))
      const artifacts = [coverageName]
      const measurements: unknown[] = []
      browserEvidence = undefined
      const startErrors = errors.length
      const startLogs = logs.length
      let failure: string | undefined
      let observed = false
      let pageCleanupFailure: string | undefined
      try {
        await withFrameworkSourceServer(context.root, context.runId, framework, logs, async (server) => {
          if (page!.isClosed()) {
            page = await browserContext!.newPage()
          }
          browserEvidence = observeBrowserErrors(page!, () => stage, errors)
          try {
            report.environment[`${framework}Url`] = server.url
            report.environment[`${framework}Instance`] = server.instance
            stage = `${framework}/initial-navigation`
            await page!.goto(server.url, { waitUntil: 'networkidle' })
            let previousSession = ''
            for (const revision of sourceRevisions) {
              stage = `${framework}/${revision}/source`
              const source = revision === 'initial' ? frameworkSource(framework, revision, context.runId) : await saveFrameworkSourceAndSettle(page!, framework, revision, context.runId, server.updateSource)
              artifacts.push(await save(`${framework}-${revision}.source.${framework === 'react' ? 'tsx' : 'vue'}`, source, 'bundle', selected))
              if (revision !== 'initial') {
                await page!.reload({ waitUntil: 'networkidle' })
              }
              await page!.waitForFunction(marker => document.querySelector<HTMLElement>('#framework-root')?.dataset.revision === marker, `${context.runId}/${framework}/${revision}`, { timeout: 15_000 })
              const initial = await readFrameworkSource(page!, selected)
              observed = true
              const initialByKind = new Map(initial.map(item => [item.kind, item]))
              const css = (await page!.locator('style').allTextContents()).join('\n')
              artifacts.push(await save(`${framework}-${revision}.css`, css || '\n', 'css', selected))
              for (const profile of selected) {
                const first = initialByKind.get(profile.kind)!
                assertions.get(profile.id)!.push(...sourceCssAssertions(profile, revision, css), { name: `${revision}/refresh-session`, stage: 'runtime', actual: Boolean(first.session) && (!previousSession || first.session !== previousSession), expected: true })
              }
              for (const state of sourceBranchStates) {
                stage = `${framework}/${revision}/${state}`
                if (state !== 'before') {
                  await page!.locator('#toggle').click()
                  await page!.waitForFunction(active => document.querySelector<HTMLElement>('[id^="probe-"]')?.dataset.active === String(active), state !== 'after')
                }
                const current = state === 'before' ? initial : await readFrameworkSource(page!, selected)
                const byKind = new Map<string, FrameworkSourceObservation>(current.map(item => [item.kind, item]))
                for (const profile of selected) {
                  const first = initialByKind.get(profile.kind)!
                  assertions.get(profile.id)!.push(...sourceRuntimeAssertions(profile, revision, state, byKind.get(profile.kind)!, { runId: context.runId, instance: server.instance, session: first.session, node: first.node }))
                }
                measurements.push({ revision, state, observed: current })
                artifacts.push(await save(`${framework}-${revision}-${state}.png`, await page!.screenshot({ fullPage: true, scale: 'css' }), 'screenshot', selected))
              }
              previousSession = initial[0]!.session
            }
          }
          catch (error) {
            failure = error instanceof Error ? error.stack ?? error.message : String(error)
            try {
              artifacts.push(await save(`${framework}-failure.png`, await page!.screenshot({ fullPage: true, scale: 'css' }), 'screenshot', selected))
              artifacts.push(await save(`${framework}-failure.html`, await page!.content(), 'log', selected))
            }
            catch (captureError) {
              failure += `\n失败页面取证失败：${String(captureError)}`
            }
          }
          finally {
            // 页面先关闭，再关闭其开发服务，避免重连错误跨入下一框架。
            stage = `${framework}/cleanup`
            try {
              await page!.close()
            }
            catch (error) {
              pageCleanupFailure = `框架页面关闭失败，停止后续框架：${String(error)}`
              failure = [failure, pageCleanupFailure].filter(Boolean).join('\n')
            }
            finally {
              browserEvidence.dispose()
            }
          }
        })
      }
      catch (error) {
        failure = [failure, error instanceof Error ? error.stack ?? error.message : String(error)].filter(Boolean).join('\n')
        try {
          if (!page || page.isClosed()) {
            throw new Error('框架页面已关闭，保留既有原件')
          }
          artifacts.push(await save(`${framework}-service-failure.png`, await page!.screenshot({ fullPage: true, scale: 'css' }), 'screenshot', selected))
          artifacts.push(await save(`${framework}-service-failure.html`, await page!.content(), 'log', selected))
        }
        catch (captureError) {
          failure += `\n失败页面取证失败：${String(captureError)}`
        }
      }
      const noErrors = errors.length === startErrors && !logs.slice(startLogs).some(line => line.startsWith('error:'))
      artifacts.push(await save(`${framework}-browser-errors.json`, JSON.stringify(browserEvidence?.records ?? [], null, 2), 'log', selected))
      artifacts.push(await save(`${framework}-measurements.json`, JSON.stringify(measurements, null, 2), 'measurements', selected))
      artifacts.push(await save(`${framework}-server.log`, [...logs.slice(startLogs), ...errors.slice(startErrors), failure ?? ''].join('\n') || '没有服务错误\n', 'log', selected))
      for (const profile of selected) {
        const actual = assertions.get(profile.id)!
        actual.push({ name: 'no-page-errors', stage: 'runtime', actual: noErrors, expected: true })
        const contract = contracts.find(contract => contract.id === profile.id)!
        const passed = !failure && actual.length === contract.requiredAssertions.length && actual.every(assertionPassed)
        report.results.push({ id: profile.id, support: 'supported', status: passed ? 'passed' : observed ? 'failed' : 'blocked', assertions: actual, artifacts: [...artifacts], warnings: errors.slice(startErrors), ...(!passed ? { reason: failure ?? '真实框架分支、精确类名、样式、节点复用或刷新绑定不符' } : {}) })
      }
      if (pageCleanupFailure) {
        throw new Error(pageCleanupFailure)
      }
    }
  }
  catch (error) {
    const completed = new Set(report.results.map(result => result.id))
    for (const profile of profiles.filter(profile => !completed.has(profile.id))) {
      report.results.push({ id: profile.id, support: 'supported', status: 'blocked', assertions: [], artifacts: [coverageName], warnings: [], reason: String(error) })
    }
  }
  finally {
    const cleanupErrors: string[] = []
    browserEvidence?.dispose()
    try {
      await browserContext?.close()
    }
    catch (error) {
      cleanupErrors.push(`context: ${String(error)}`)
    }
    if (!borrowedBrowser) {
      try {
        await browser?.close()
      }
      catch (error) {
        cleanupErrors.push(`browser: ${String(error)}`)
      }
    }
    if (cleanupErrors.length) {
      report.environment.cleanupError = cleanupErrors.join('\n')
      for (const result of report.results) {
        result.status = 'failed'
        result.reason = `本任务真实框架资源关闭失败：${cleanupErrors.join('\n')}`
      }
    }
  }
  validateCapabilityReport(report, contracts, report.identity, context.runId, `web-${engine}`)
  await verifyReportArtifacts(report, output.directory)
  await persistReport(output, report, contracts)
  return report
}
