import type { Browser, Page } from 'playwright'
import type { WebHmrStep, WebRuntimeStyleAssertion } from './cases'
import type { AttachedWebServer } from './web/attached'
import type { WebPageDiagnostics } from './web/runtime'
import type { WebServerSession } from './web/session'

import fs from 'node:fs/promises'

import path from 'node:path'
import { chromium } from 'playwright'
import { cleanupHBuilderXResources } from '../../scripts/hbuilderx-project-resources'

import {
  fetchText,
  joinUrl,
  pollIntervalMs,
  resolveBaseUrls,
  resolveChromeExecutable,
  serverTimeoutMs,
  wait,
} from './process'
import { appendHmrSourceMutation, createHmrSourceRestore } from './source-mutations'
import { cleanupWebHmrSession } from './web/cleanup'
import { captureHBuilderXFailure } from './web/diagnostics'
import { assertServerIdentity, sameSourceFile } from './web/identity'
import { readRuntimeStyles, waitForHmrMarker, waitForInitialPageText, waitForRuntimeStyles } from './web/runtime'
import { createWebSession } from './web/session'
import { rewriteHmrMarker } from './web/source'

export { clearDevProcess, getDevProcess } from './web/dev-server'

async function waitForUrl(url: string, session: WebServerSession, logs: string[], timeoutMs = serverTimeoutMs) {
  let lastError: unknown
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    await session.ensureRunning()
    try {
      return await fetchText(url, Math.max(1, timeoutMs - (Date.now() - startedAt)))
    }
    catch (error) {
      lastError = error
    }
    await wait(pollIntervalMs)
  }

  throw new Error(`等待 URL 超时：${url}\nlast=${lastError instanceof Error ? lastError.message : String(lastError)}\n${logs.join('')}`)
}

async function waitForPath(baseUrl: string, requestPath: string, session: WebServerSession, logs: string[], timeoutMs = serverTimeoutMs) {
  let lastError: unknown
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    for (const candidate of resolveBaseUrls(logs, baseUrl)) {
      try {
        return {
          baseUrl: candidate,
          text: await waitForUrl(joinUrl(candidate, requestPath), session, logs, pollIntervalMs * 2),
        }
      }
      catch (error) {
        lastError = error
        await session.ensureRunning()
      }
    }
    await wait(pollIntervalMs)
  }

  throw new Error(`等待路径超时：${requestPath}\nlast=${lastError instanceof Error ? lastError.message : String(lastError)}\n${logs.join('')}`)
}

async function waitForCss(url: string, entries: Array<string | RegExp>, session: WebServerSession, logs: string[]) {
  const startedAt = Date.now()
  let latest = ''
  while (Date.now() - startedAt < serverTimeoutMs) {
    latest = await waitForUrl(url, session, logs, pollIntervalMs * 2)
    const ok = entries.every((entry) => {
      return typeof entry === 'string' ? latest.includes(entry) : entry.test(latest)
    })
    if (ok) {
      return latest
    }
    await wait(pollIntervalMs)
  }
  const missing = entries.filter((entry) => {
    return typeof entry === 'string' ? !latest.includes(entry) : !entry.test(latest)
  })
  throw new Error(`等待 CSS 内容超时：${url}\nmissing=${missing.map(String).join(', ')}\n${latest.slice(0, 1000)}\n${logs.join('')}`)
}

export async function runWebHmr(
  projectRoot: string,
  sourceFile: string,
  markerAnchors: string[],
  initialCssPath: string,
  hmrCssPath: string,
  initialCssContains: Array<string | RegExp>,
  initialRuntimeStyles: WebRuntimeStyleAssertion[] | undefined,
  persistentRuntimeStyles: WebRuntimeStyleAssertion[] | undefined,
  hmrSteps: WebHmrStep[],
  launchWithHBuilderX = false,
  initialTextContains: string[] = [],
  serverIdentityPath?: string,
  attached?: AttachedWebServer,
) {
  const artifactRoot = attached?.artifactRoot ?? path.resolve(__dirname, '../.artifacts/web-hmr', `${path.basename(projectRoot)}-${Date.now()}`)
  await fs.mkdir(artifactRoot, { recursive: true })
  const logFile = path.join(artifactRoot, 'server.log')
  await fs.writeFile(logFile, '')
  let session: WebServerSession | undefined
  let browser: Browser | undefined
  let page: Page | undefined
  const diagnostics: WebPageDiagnostics = { errors: [], requests: [], warnings: [] }
  let restore: (() => Promise<void>) | undefined

  let failure: { error: unknown } | undefined
  let result!: {
    hmrCss: string[]
    initialCss: string
    pageErrors: WebPageDiagnostics['errors']
    pageHtml: string
    pageOverlayText: string | null | undefined
    pageWarnings: WebPageDiagnostics['warnings']
    serverLogs: string
  }
  try {
    session = await createWebSession(projectRoot, launchWithHBuilderX, logFile, attached, serverIdentityPath)
    const { logs, baseUrl } = session
    const executablePath = await resolveChromeExecutable()
    browser = await chromium.launch({
      ...(executablePath ? { executablePath } : {}),
      headless: true,
    })
    const ready = await waitForPath(baseUrl, '/', session, logs)
    if (serverIdentityPath) {
      const identity = JSON.parse(await fetchText(joinUrl(ready.baseUrl, serverIdentityPath)))
      assertServerIdentity(identity, await fs.realpath(projectRoot))
      await fs.writeFile(path.join(artifactRoot, 'identity.json'), JSON.stringify(identity, null, 2))
    }
    page = await browser.newPage()
    page.on('requestfailed', (request) => {
      diagnostics.requests.push(`failed ${request.url()} ${request.failure()?.errorText ?? ''}`.trim())
    })
    page.on('response', (response) => {
      const url = response.url()
      if (response.status() >= 400 || url.endsWith('/') || /\/main|App\.uvue|index\.uvue|main\.css|@vite\/client|pages-json-js/.test(url)) {
        diagnostics.requests.push(`${response.status()} ${url}`)
      }
    })
    page.on('console', (message) => {
      if (message.type() === 'error') {
        const location = message.location().url
        diagnostics.errors.push(`${message.text()}${location ? ` (${location})` : ''}`)
      }
      else if (message.type() === 'warning') {
        diagnostics.warnings.push(message.text())
      }
    })
    page.on('pageerror', (error) => {
      diagnostics.errors.push(error.stack ?? error.message)
    })
    await page.goto(joinUrl(ready.baseUrl, '/'), { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => document.readyState !== 'loading')
    await waitForInitialPageText(page, initialTextContains, logs, diagnostics)

    await waitForRuntimeStyles(page, initialRuntimeStyles, 'initial', logs, diagnostics, true)
    const initialCss = await waitForCss(joinUrl(ready.baseUrl, initialCssPath), initialCssContains, session, logs)
    await fs.writeFile(path.join(artifactRoot, 'initial.css'), initialCss)
    await page.screenshot({ path: path.join(artifactRoot, 'initial.png') })
    restore = attached
      ? undefined
      : await createHmrSourceRestore([
          sourceFile,
          ...hmrSteps.flatMap(step => step.sourceMutation ? [path.resolve(projectRoot, step.sourceMutation.file)] : []),
        ])
    const hmrCss: string[] = []
    for (const [index, step] of hmrSteps.entries()) {
      await session.ensureRunning()
      const sameFileReplace = step.sourceMutation?.replace && sameSourceFile(projectRoot, step.sourceMutation.file, sourceFile)
      if (step.sourceMutation && !sameFileReplace) {
        await appendHmrSourceMutation(projectRoot, step.sourceMutation, attached?.writeSource)
        if (step.sourceMutation.cssContains?.length) {
          hmrCss.push(await waitForCss(joinUrl(ready.baseUrl, hmrCssPath), step.sourceMutation.cssContains, session, logs))
        }
      }
      await rewriteHmrMarker(sourceFile, markerAnchors, hmrSteps, index, sameFileReplace ? step.sourceMutation?.replace : undefined, attached?.writeSource)
      await waitForHmrMarker(page, step.markerText)
      await waitForRuntimeStyles(page, [
        ...(persistentRuntimeStyles ?? []),
        ...(step.runtimeStyles ?? []),
      ], `hmr:${step.markerText}`, logs, diagnostics)
      const css = await waitForCss(joinUrl(ready.baseUrl, hmrCssPath), step.cssContains, session, logs)
      hmrCss.push(css)
      await fs.writeFile(path.join(artifactRoot, `save-${index + 1}.css`), css)
      await page.screenshot({ path: path.join(artifactRoot, `save-${index + 1}.png`) })
      if (step.reload) {
        await page.reload({ waitUntil: 'domcontentloaded' })
        await waitForHmrMarker(page, step.markerText)
        await waitForRuntimeStyles(page, [...(persistentRuntimeStyles ?? []), ...(step.runtimeStyles ?? [])], `reload:${step.markerText}`, logs, diagnostics)
      }
      await fs.writeFile(path.join(artifactRoot, `save-${index + 1}.json`), JSON.stringify({
        marker: step.markerText,
        styles: await Promise.all((step.runtimeStyles ?? []).map(assertion => readRuntimeStyles(page!, assertion))),
      }, null, 2))
    }
    const errorOverlay = page.locator('vite-error-overlay')
    const pageOverlayText = await errorOverlay.count() > 0
      ? await errorOverlay.first().textContent()
      : undefined
    await session.ensureRunning()

    result = {
      hmrCss,
      initialCss,
      pageErrors: diagnostics.errors,
      pageHtml: ready.text,
      pageOverlayText,
      pageWarnings: diagnostics.warnings,
      serverLogs: await session.readLogs(),
    }
  }
  catch (error) {
    failure = { error }
    try {
      await cleanupHBuilderXResources([
        async () => {
          if (attached) {
            await fs.copyFile(attached.logFile, logFile)
          }
        },
        async () => {
          if (launchWithHBuilderX && !attached) {
            await captureHBuilderXFailure(artifactRoot)
          }
        },
        () => fs.writeFile(path.join(artifactRoot, 'failure.txt'), error instanceof Error ? error.stack ?? error.message : String(error)),
      ])
    }
    catch (reportError) {
      failure = { error: new AggregateError([error, reportError], 'HBuilderX Web 验证与失败取证均失败。', { cause: error }) }
    }
  }
  finally {
    try {
      await cleanupHBuilderXResources([
        async () => {
          await fs.writeFile(path.join(artifactRoot, 'diagnostics.json'), JSON.stringify(diagnostics, null, 2))
          if (page) {
            await fs.writeFile(path.join(artifactRoot, 'page.html'), await page.content().catch(() => ''))
            await page.screenshot({ path: path.join(artifactRoot, 'final.png') }).catch(() => {})
          }
        },
        () => cleanupWebHmrSession({
          closeBrowser: async () => browser?.close(),
          stopServer: async () => session?.stop(),
          restoreSource: async () => restore?.(),
          closeProject: async () => session?.closeProject(),
        }),
      ])
    }
    catch (error) {
      failure = { error: failure
        ? new AggregateError([failure.error, error], 'HBuilderX Web 验证与收尾均失败。', { cause: failure.error })
        : error }
    }
  }
  if (failure) {
    throw failure.error
  }
  return result
}
