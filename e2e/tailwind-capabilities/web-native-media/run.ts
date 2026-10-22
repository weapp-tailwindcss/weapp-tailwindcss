import type { Browser, BrowserContext, Page } from 'playwright'
import type { RunContext } from '../context'
import type { BrowserEngine, CapabilityResult } from '../types'
import type { NativeMediaSidecar } from './types'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { newReport, persistReport } from '../context'
import { withGeneratorFixture } from '../fixture'
import { digest } from '../identity'
import { assertionPassed, receipt, validateCapabilityReport, verifyReportArtifacts } from '../report'
import { nativeMediaContract } from './contract'
import { bounded } from './deadline'
import { nativeMediaCss, nativeMediaProbe, nativeMediaUrl, renderNativeMedia } from './fixtures'
import { observeNativeContrast } from './native'
import { replayNativeMedia } from './replay'

/** 复用本轮 Browser，仅创建本案例的独立 context，其他引擎不能伪造 CDP 成功。 */
export async function runNativeMediaWeb(base: RunContext, engine: BrowserEngine, browser: Browser) {
  if (engine !== 'chromium' || (base.caseFilter && !base.caseFilter.test(`runtime/${nativeMediaProbe.id}`))) {
    throw new Error(`${engine} 没有匹配的原生媒体运行时夹具`)
  }
  const context = { ...base, directory: path.join(base.directory, 'native-media') }
  const contract = nativeMediaContract(context.runId)
  const report = await newReport(context, `web-${engine}`, [contract], { probe: nativeMediaProbe, css: nativeMediaCss, html: renderNativeMedia('GENERATED_CSS', 'RUN_ID') }, { engine, browserVersion: browser.version(), mode: 'native-cdp-media-computed-and-png', browserOwnership: 'borrowed' })
  const raw: NativeMediaSidecar = { schemaVersion: 2, id: contract.id, runId: context.runId, engine, browserVersion: browser.version(), observation: { states: [], cleanup: { detached: false, errors: [] } }, warnings: [] }
  const artifacts: string[] = []
  const warnings = raw.warnings
  let owned: BrowserContext | undefined
  let page: Page | undefined
  let reason: string | undefined
  try {
    owned = await browser.newContext({ viewport: { width: 640, height: 480 }, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce', contrast: 'no-preference', forcedColors: 'none' })
    page = await owned.newPage()
    page.setDefaultTimeout(5_000)
    page.setDefaultNavigationTimeout(5_000)
    page.on('pageerror', error => warnings.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') {
        warnings.push(message.text())
      }
    })
    await withGeneratorFixture(context.root, nativeMediaCss, {}, async (generator) => {
      const output = await generator.generate({ target: 'web', candidates: [nativeMediaProbe.candidate], scanSources: false })
      raw.generation = { candidates: [...output.classSet], cssHash: digest(output.css) }
      await writeFile(path.join(context.directory, 'generated.css'), output.css)
      artifacts.push('generated.css')
      report.artifacts.push(await receipt(path.join(context.directory, 'generated.css'), context.directory, context.runId, [contract.id], 'css'))
      const url = nativeMediaUrl(context.runId)
      await page!.route('**/*', route => route.request().url() === url ? route.fulfill({ status: 200, contentType: 'text/html', body: renderNativeMedia(output.css, context.runId) }) : route.abort())
      await page!.goto(url, { waitUntil: 'load' })
      await observeNativeContrast(page!, raw.observation, async (state) => {
        const name = `${nativeMediaProbe.id}-${state}.png`
        await page!.screenshot({ path: path.join(context.directory, name), fullPage: true, scale: 'css' })
        artifacts.push(name)
        report.artifacts.push(await receipt(path.join(context.directory, name), context.directory, context.runId, [contract.id], 'screenshot'))
        return name
      }, context.runId, raw.generation!.cssHash)
    })
  }
  catch (error) {
    reason = String(error)
  }
  finally {
    try {
      if (owned) {
        await bounded('关闭原生媒体 context', () => owned!.close())
      }
    }
    catch (error) {
      reason = `原生媒体 context 关闭失败：${String(error)}${reason ? `；${reason}` : ''}`
      report.environment['cleanupError'] = reason
    }
  }
  if (reason) {
    raw.error = reason
  }
  const name = 'measurements.json'
  await writeFile(path.join(context.directory, name), `${JSON.stringify(raw, null, 2)}\n`)
  artifacts.push(name)
  report.artifacts.push(await receipt(path.join(context.directory, name), context.directory, context.runId, [contract.id], 'measurements'))
  let assertions: CapabilityResult['assertions'] = []
  try {
    const replay = await replayNativeMedia(context.directory, context.runId, browser.version())
    assertions = replay.assertions
    reason ??= replay.error
  }
  catch (error) {
    reason = `${reason ? `${reason}；` : ''}原始证据复读失败：${String(error)}`
    await writeFile(path.join(context.directory, 'replay-error.json'), `${JSON.stringify({ runId: context.runId, error: reason }, null, 2)}\n`)
    artifacts.push('replay-error.json')
    report.artifacts.push(await receipt(path.join(context.directory, 'replay-error.json'), context.directory, context.runId, [contract.id], 'log'))
  }
  const passed = !reason && !warnings.length && assertions.length > 0 && assertions.every(assertionPassed)
  const result: CapabilityResult = { id: contract.id, status: passed ? 'passed' : 'failed', support: 'supported', assertions, artifacts, warnings, ...(!passed ? { reason: reason ?? '原生媒体、计算样式、原始像素或恢复未满足独立预期。' } : {}) }
  report.results.push(result)
  validateCapabilityReport(report, [contract], report.identity, context.runId, `web-${engine}`)
  await verifyReportArtifacts(report, context.directory)
  await persistReport(context, report, [contract])
  return report
}
