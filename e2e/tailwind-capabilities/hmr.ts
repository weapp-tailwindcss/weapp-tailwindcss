import type { Browser } from 'playwright'
import type { RunContext } from './context'
import type { BrowserEngine, SemanticAssertion } from './types'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium, firefox, webkit } from 'playwright'
import { newReport, persistReport } from './context'
import { observeHmrBrowserErrors } from './hmr/browser-observer'
import { hmrAssertions, hmrContract } from './hmr/contract'
import { hmrCss, hmrIcon, hmrPage, hmrSource, hmrStates } from './hmr/fixture'
import { withHmrServer } from './hmr/server'
import { assertionPassed, receipt, validateCapabilityReport, verifyReportArtifacts } from './report'

interface UpdateMessage { type?: string, updates?: Array<{ path?: string, acceptedPath?: string }> }

export async function runHmr(context: RunContext, engine: BrowserEngine, borrowedBrowser?: Browser) {
  const contract = hmrContract()
  const output = { ...context, directory: path.join(context.directory, 'hmr') }
  const report = await newReport(output, `web-${engine}`, [contract], { hmrCss, hmrStates, hmrIcon, hmrPage }, { engine, browserVersion: 'not-started', mode: 'real-vite-source-hmr', headless: true })
  const logs: string[] = []
  const messages: UpdateMessage[] = []
  const errors: string[] = []
  const measurements: unknown[] = []
  const artifacts: string[] = []
  const assertions: SemanticAssertion[] = []
  let browser: Browser | undefined
  let closeContext: (() => Promise<void>) | undefined
  let failure: string | undefined
  let failureCapture: (() => Promise<void>) | undefined
  let browserEvidence: ReturnType<typeof observeHmrBrowserErrors> | undefined
  let stage = 'initial-navigation'
  const save = async (name: string, content: string | Uint8Array, kind: 'css' | 'bundle' | 'measurements' | 'screenshot' | 'log') => {
    const file = path.join(output.directory, name)
    await writeFile(file, content)
    report.artifacts.push(await receipt(file, output.directory, output.runId, [contract.id], kind))
    artifacts.push(name)
  }
  try {
    await withHmrServer(context.root, context.runId, logs, async (server) => {
      report.environment.url = server.url
      report.environment.instance = server.instance
      browser = borrowedBrowser ?? await { chromium, firefox, webkit }[engine].launch({ headless: true })
      report.environment.browserVersion = browser.version()
      const browserContext = await browser.newContext({ viewport: { width: 640, height: 480 } })
      if (borrowedBrowser) {
        closeContext = () => browserContext.close()
      }
      await browserContext.addInitScript(() => {
        (globalThis as any).__tailwindHmrSession = crypto.randomUUID()
      })
      const page = await browserContext.newPage()
      failureCapture = async () => {
        await save('failure.png', await page.screenshot({ fullPage: true, scale: 'css' }), 'screenshot')
        await save('failure.html', await page.content(), 'log')
      }
      browserEvidence = observeHmrBrowserErrors(page, () => stage, errors)
      page.on('websocket', socket => socket.on('framereceived', (event) => {
        try {
          messages.push(JSON.parse(String(event.payload)))
        }
        catch {
          logs.push(`非 JSON WebSocket 帧：${String(event.payload)}`)
        }
      }))
      const read = () => page.locator('#probe').evaluate(element => ({ marker: (element as HTMLElement).dataset.stage ?? '', width: element.getBoundingClientRect().width, session: String((globalThis as any).__tailwindHmrSession ?? ''), instance: document.querySelector('meta[name="tailwind-instance"]')?.getAttribute('content') ?? '' }))
      const capture = async (name: string) => {
        await save(`${name}.png`, await page.screenshot({ fullPage: true, scale: 'css' }), 'screenshot')
        const css = await page.locator('style').allTextContents()
        await save(`${name}.css`, css.join('\n') || '\n', 'css')
      }
      await page.goto(server.url, { waitUntil: 'networkidle' })
      await page.locator('#probe').waitFor()
      const initial = await read()
      await save('initial.source.js', hmrSource(context.runId, hmrStates[0]), 'bundle')
      for (const state of hmrStates) {
        stage = state.id
        const start = messages.length
        if (state.id !== 'initial') {
          const source = hmrSource(context.runId, state)
          await save(`${state.id}.source.js`, source, 'bundle')
          await writeFile(server.source, source)
          await page.waitForFunction(({ marker, width }) => {
            const element = document.querySelector<HTMLElement>('#probe')
            return element?.dataset.stage === marker && Math.abs(element.getBoundingClientRect().width - width) <= 0.25
          }, { marker: `${context.runId}/${state.id}`, width: state.width }, { timeout: 15_000 })
        }
        const current = messages.slice(start)
        const actual = { ...await read(), sourceUpdate: current.some(message => message.type === 'update' && message.updates?.some(update => [update.path, update.acceptedPath].some(value => value?.split('?')[0] === '/probe.js'))), fullReload: current.some(message => message.type === 'full-reload') }
        assertions.push(...hmrAssertions(state, actual, context.runId, initial.session, server.instance))
        measurements.push({ state: state.id, ...actual, messages: current })
        await capture(state.id)
      }
      stage = 'refresh'
      await page.reload({ waitUntil: 'networkidle' })
      const refreshed = await read()
      assertions.push(
        { name: 'refresh/width', stage: 'hmr', actual: refreshed.width, expected: 80, tolerance: 0.25 },
        { name: 'refresh/marker', stage: 'hmr', actual: refreshed.marker === `${context.runId}/deleted`, expected: true },
        { name: 'refresh/session-replaced', stage: 'hmr', actual: Boolean(refreshed.session) && refreshed.session !== initial.session, expected: true },
        { name: 'refresh/instance', stage: 'hmr', actual: refreshed.instance === server.instance, expected: true },
      )
      measurements.push({ state: 'refresh', ...refreshed })
      await capture('refresh')
      if (errors.length || logs.some(message => message.startsWith('error:'))) {
        throw new Error(`浏览器或 Vite 错误：${[...errors, ...logs].join('\n')}`)
      }
    })
  }
  catch (error) {
    failure = error instanceof Error ? error.stack ?? error.message : String(error)
    try {
      await failureCapture?.()
    }
    catch (captureError) {
      failure += `\n失败页面取证失败：${String(captureError)}`
    }
  }
  finally {
    browserEvidence?.dispose()
    try {
      if (closeContext) {
        await closeContext()
      }
      else if (!borrowedBrowser) {
        await browser?.close()
      }
    }
    catch (error) {
      failure = `${failure ?? ''}\n浏览器关闭失败：${String(error)}`
    }
  }
  if (errors.length || logs.some(message => message.startsWith('error:'))) {
    failure ??= `浏览器或 Vite 错误：${[...errors, ...logs].join('\n')}`
  }
  await save('measurements.json', JSON.stringify({ measurements, messages, errors, browserEvents: browserEvidence?.records ?? [] }, null, 2), 'measurements')
  await save('server.log', [...logs, failure ?? ''].join('\n') || '没有服务错误\n', 'log')
  const passed = !failure && assertions.length === contract.requiredAssertions.length && assertions.every(assertionPassed)
  report.results.push({ id: contract.id, support: 'supported', status: passed ? 'passed' : 'failed', assertions, artifacts, warnings: errors, ...(!passed ? { reason: failure ?? '源码 HMR 的保存标识、样式、消息或同页面约束未通过' } : {}) })
  validateCapabilityReport(report, [contract], report.identity, context.runId, `web-${engine}`)
  await verifyReportArtifacts(report, output.directory)
  await persistReport(output, report, [contract])
  return report
}
