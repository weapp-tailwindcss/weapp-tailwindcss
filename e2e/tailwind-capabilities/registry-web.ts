import type { Browser, Page } from 'playwright'
import type { RunContext } from './context'
import type { BrowserEngine } from './types'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { chromium, firefox, webkit } from 'playwright'
import { newReport, persistReport } from './context'
import { withGeneratorFixture } from './fixture'
import { collectInventory, loadInventory, validateInventory } from './inventory'
import { registryAssertions, registryWebContracts, registryWebCoverage } from './registry-web/contract'
import { registryEmittedNegativeDeclaration, registryLimitAssertions, registryWebLimit } from './registry-web/limits'
import { observeRegistry } from './registry-web/measure'
import { registryWebProfile } from './registry-web/profiles'
import { buildRegistryReference } from './registry-web/reference'
import { registryBidiOptions, registryBidiProfiles, registryFrames } from './registry-web/transport'
import { receipt, validateCapabilityReport, verifyReportArtifacts } from './report'

export { registryAssertions, registryWebContracts, registryWebCoverage } from './registry-web/contract'
export { registryWebProfile } from './registry-web/profiles'

export async function runRegistryWeb(context: RunContext, engine: BrowserEngine, batchSize = 20, borrowedBrowser?: Browser) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 40) {
    throw new Error('注册 utility 对照的 batchSize 必须为 1 到 40 的整数')
  }
  const inventory = await loadInventory()
  validateInventory(await collectInventory(), inventory)
  const profiles = inventory.utilities.map(registryWebProfile).filter(profile => !context.caseFilter || context.caseFilter.test(profile.id))
  if (!profiles.length) {
    throw new Error('注册 utility 过滤条件没有匹配任何语义夹具')
  }
  const contracts = registryWebContracts(profiles, engine, process.platform)
  const reference = await buildRegistryReference(profiles)
  if (reference.identity.themeSha256 !== inventory.themeSha256) {
    throw new Error('官方参考主题与固定 inventory 不一致，必须先显式更新上游能力基线')
  }
  const output = { ...context, directory: path.join(context.directory, 'registry') }
  const report = await newReport(output, `web-${engine}`, contracts, { profiles, reference: reference.identity, batchSize }, { engine, platform: process.platform, browserVersion: 'not-started', mode: 'registered-utility-independent-reference', utilityCases: profiles.length, batchSize, headless: true })
  const allIds = contracts.map(item => item.id)
  const save = async (name: string, data: unknown, kind: 'css' | 'measurements', ids = allIds) => {
    const file = path.join(output.directory, name)
    await writeFile(file, typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`)
    report.artifacts.push(await receipt(file, output.directory, output.runId, ids, kind))
  }
  await save('reference.css', reference.css, 'css')
  await save('fixtures.json', { profiles, reference: reference.identity, coverage: registryWebCoverage(inventory) }, 'measurements')
  let browser: Browser | undefined
  let bidiBrowser: Browser | undefined
  let bidiPage: Page | undefined
  let closeContext: (() => Promise<void>) | undefined
  const errors: string[] = []
  try {
    await withGeneratorFixture(output.root, reference.productInput, {}, async (generator) => {
      const generated = await generator.generate({ target: 'web', candidates: [...new Set(profiles.map(item => item.candidate))], scanSources: false })
      await save('generated.css', generated.css, 'css')
      browser = borrowedBrowser ?? await { chromium, firefox, webkit }[engine].launch({ headless: true })
      report.environment.browserVersion = browser.version()
      const browserContext = await browser.newContext({ viewport: { width: 960, height: 900 }, colorScheme: 'light', reducedMotion: 'reduce' })
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
      await page.route('http://tailwind-registry.invalid/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="80"><path fill="#123456" d="M0 0h80v80H0z"/><path fill="#abcdef" d="M80 0h80v80H80z"/></svg>' }))
      for (let offset = 0; offset < profiles.length; offset += batchSize) {
        const batch = profiles.slice(offset, offset + batchSize)
        const ids = batch.map(item => item.id)
        const prefix = `batch-${String(offset / batchSize + 1).padStart(3, '0')}`
        const startError = errors.length
        const frames = await registryFrames(page, batch, reference.css, generated.css)
        const [baselines, references, products] = await Promise.all(frames.map(frame => observeRegistry(frame!, batch)))
        const bidiProfiles = registryBidiProfiles(engine, batch)
        const bidiScreenshot = `${prefix}-bidi.png`
        if (bidiProfiles.length) {
          if (!bidiBrowser) {
            bidiBrowser = await firefox.launch(registryBidiOptions(firefox.executablePath()))
            if (bidiBrowser.version() !== browser.version()) {
              throw new Error('Firefox BiDi 与主浏览器版本不同，不能替换运行时证据')
            }
            bidiPage = await bidiBrowser.newPage({ viewport: { width: 960, height: 900 }, colorScheme: 'light', reducedMotion: 'reduce' })
            bidiPage.on('pageerror', error => errors.push(error.message))
            bidiPage.on('console', (message) => {
              if (message.type() === 'error') {
                errors.push(message.text())
              }
            })
            report.environment.scrollbarProtocol = 'webdriver-bidi'
            report.environment.scrollbarBrowserVersion = bidiBrowser.version()
            report.environment.scrollbarBrowserOwnership = 'task-created-headless-finally-closed'
          }
          const alternateFrames = await registryFrames(bidiPage!, bidiProfiles, reference.css, generated.css)
          const readings = await Promise.all(alternateFrames.map(frame => observeRegistry(frame, bidiProfiles)))
          for (const [index, profile] of bidiProfiles.entries()) {
            const position = batch.findIndex(item => item.id === profile.id)
            baselines![position] = readings[0]![index]!
            references![position] = readings[1]![index]!
            products![position] = readings[2]![index]!
          }
          await bidiPage!.screenshot({ path: path.join(output.directory, bidiScreenshot), fullPage: true, scale: 'css' })
          report.artifacts.push(await receipt(path.join(output.directory, bidiScreenshot), output.directory, output.runId, bidiProfiles.map(profile => profile.id), 'screenshot'))
        }
        await save(`${prefix}.json`, { engine, browserVersion: browser!.version(), profiles: batch, baselines, references, products, protocols: Object.fromEntries(batch.map(profile => [profile.id, bidiProfiles.includes(profile) ? 'webdriver-bidi' : 'playwright-default'])), errors: errors.slice(startError) }, 'measurements', ids)
        const screenshot = `${prefix}.png`
        const regularIds = batch.filter(profile => !bidiProfiles.includes(profile)).map(profile => profile.id)
        if (regularIds.length) {
          await page.screenshot({ path: path.join(output.directory, screenshot), fullPage: true, scale: 'css' })
          report.artifacts.push(await receipt(path.join(output.directory, screenshot), output.directory, output.runId, regularIds, 'screenshot'))
        }
        for (const [index, profile] of batch.entries()) {
          const expected = references![index]!
          const limit = registryWebLimit(profile, engine, process.platform)
          const assertions = limit
            ? registryLimitAssertions(limit, generated.classSet.has(profile.candidate), browser!.version(), expected, baselines![index]!, products![index]!, registryEmittedNegativeDeclaration(generated.css, profile, limit))
            : registryAssertions(profile, generated.classSet.has(profile.candidate), expected, baselines![index]!, products![index]!)
          const failed = assertions.filter(item => item.actual !== item.expected)
          const mismatch = failed.some(item => !['reference-measurable', 'reference-effective'].includes(item.name)) || errors.length !== startError
          const status = mismatch ? 'failed' : failed.length ? 'not-run' : 'passed'
          const reason = mismatch ? `产品产物与独立官方参考不一致：${failed.map(item => item.name).join('、')}${errors.length !== startError ? '；本批发生页面错误' : ''}` : failed.length ? `当前语义上下文未建立可观测的官方参考效果：${failed.map(item => item.name).join('、')}；保留未执行，不将默认值相等当作通过。` : limit?.reason
          report.results.push({ id: profile.id, status, support: limit ? 'unsupported' : 'supported', assertions, artifacts: ['reference.css', 'generated.css', 'fixtures.json', `${prefix}.json`, bidiProfiles.includes(profile) ? bidiScreenshot : screenshot], warnings: [...expected.unavailableProperties.map(property => `当前引擎未暴露该属性的 computed value：${property}`), ...errors.slice(startError)], ...(reason ? { reason } : {}) })
        }
      }
    })
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    const completed = new Set(report.results.map(item => item.id))
    for (const contract of contracts.filter(item => !completed.has(item.id))) {
      report.results.push({ id: contract.id, status: 'blocked', support: contract.expectation.support, assertions: [], warnings: [], artifacts: [], reason })
    }
  }
  finally {
    const cleanups = await Promise.allSettled([closeContext ? closeContext() : browser?.close(), bidiBrowser?.close()])
    for (const cleanup of cleanups) {
      if (cleanup.status !== 'rejected') {
        continue
      }
      const reason = `本任务 ${engine} registry 浏览器关闭失败：${cleanup.reason instanceof Error ? cleanup.reason.message : String(cleanup.reason)}`
      report.environment.cleanupError = reason
      for (const result of report.results) {
        result.status = 'failed'
        result.reason = reason
      }
    }
  }
  validateCapabilityReport(report, contracts, report.identity, output.runId, `web-${engine}`)
  await verifyReportArtifacts(report, output.directory)
  await persistReport(output, report, contracts)
  return report
}
