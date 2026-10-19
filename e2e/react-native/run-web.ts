/* eslint-disable antfu/no-top-level-await, perfectionist/sort-imports, style/max-statements-per-line */

import type { Server } from 'node:http'
import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { stopOwnedProcess } from './process'
import { createRuntimeArtifacts } from './runtime-artifacts'
import type { Browser } from 'playwright'
import { reactNativeWebBrowser } from './web-browser'
import type { ReactNativeReport } from './catalog'
import { validateReactNativeReport } from './reports'
import { reactNativeVersions, RN_CATALOG_HASH, RN_FIXTURE_HASH } from './catalog'
import { captureNativePair, validateNativeArtifacts } from './pair-evidence'
import { createSemanticReporter } from './semantic-reporter'

interface ReportEnvelope { hmrMarker: string, cssHmrColor: string, report: ReactNativeReport }

const repoRoot = path.resolve(import.meta.dirname, '../..')
const exampleRoot = path.resolve(repoRoot, 'examples/react-native-expo')
const selectedBrowser = reactNativeWebBrowser(process.env['RN_WEB_BROWSER'])
const artifactSession = await createRuntimeArtifacts(path.resolve(repoRoot, `e2e/.artifacts/react-native-web-${selectedBrowser.name}`))
const artifacts = artifactSession.directory
const reportsDir = path.resolve(repoRoot, 'e2e/react-native/reports/v2')
const markerFile = path.resolve(exampleRoot, 'src/hmr-marker.ts')
const cssFile = path.resolve(exampleRoot, 'global.css')
const reports: ReportEnvelope[] = []
const updateBaseline = process.env['RN_UPDATE_BASELINE'] === '1'
const runId = process.env['TAILWIND_E2E_RUN_ID'] ?? randomUUID()
let semanticPage: import('playwright').Page | undefined
const semanticReporter = createSemanticReporter({ runId, catalogHash: RN_CATALOG_HASH, fixtureHash: RN_FIXTURE_HASH, versions: reactNativeVersions() }, pair => captureNativePair(pair, {
  runId,
  artifacts,
  capture: async (name) => {
    if (!semanticPage) {
      throw new Error('Web semantic page is not ready')
    }
    const file = path.join(artifacts, name)
    await semanticPage.screenshot({ path: file })
    return file
  },
}))

function startReporter() {
  let server: Server
  const ready = new Promise<number>((resolve) => {
    server = createServer((request, response) => {
      response.setHeader('access-control-allow-origin', '*')
      response.setHeader('access-control-allow-headers', 'content-type')
      if (request.method === 'OPTIONS') { response.writeHead(204).end(); return }
      if (semanticReporter.handle(request, response)) {
        return
      }
      if (request.method !== 'POST') { response.writeHead(404).end(); return }
      const chunks: Buffer[] = []
      request.on('data', chunk => chunks.push(Buffer.from(chunk)))
      request.on('end', () => {
        void (async () => {
          const envelope = JSON.parse(Buffer.concat(chunks).toString('utf8')) as ReportEnvelope
          await fs.writeFile(path.join(artifacts, 'report.json'), `${JSON.stringify(envelope.report, null, 2)}\n`, 'utf8')
          reports.push(envelope)
          response.writeHead(204).end()
        })().catch((error) => {
          response.writeHead(400).end(String(error))
        })
      })
    })
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolve(typeof address === 'object' && address ? address.port : 0)
    })
  })
  return { ready, close: () => new Promise<void>(resolve => server.close(() => resolve())) }
}

async function waitForWeb(expo: ReturnType<typeof execa>, timeout = 120_000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (typeof expo.exitCode === 'number') { throw new TypeError(`Expo Web exited with code ${expo.exitCode}`) }
    try {
      const response = await fetch('http://127.0.0.1:8082')
      if (response.ok) { return }
    }
    catch {}
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error('Timed out waiting for Expo Web on port 8082')
}

async function waitForReport(marker: string, cssHmrColor: string, timeout = 120_000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    const envelope = reports.find(item => item.hmrMarker === marker && item.cssHmrColor === cssHmrColor)
    if (envelope) { return envelope }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for Web report marker=${marker} css=${cssHmrColor}`)
}

async function fileHash(file: string) {
  return createHash('sha256').update(await fs.readFile(file)).digest('hex')
}

async function main() {
  await fs.rm(artifacts, { recursive: true, force: true })
  await fs.mkdir(artifacts, { recursive: true })
  if (updateBaseline) { await fs.mkdir(reportsDir, { recursive: true }) }
  const originalMarker = await fs.readFile(markerFile, 'utf8')
  const originalCss = await fs.readFile(cssFile, 'utf8')
  const reporter = startReporter()
  const reporterPort = await reporter.ready
  const logFile = await fs.open(path.resolve(artifacts, 'metro.log'), 'w')
  const expo = execa('pnpm', ['--filter', '@weapp-tailwindcss/example-react-native-expo', 'exec', 'expo', 'start', '--web', '--localhost', '--port', '8082', '--clear'], {
    cwd: repoRoot,
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      CI: '0',
      EXPO_PUBLIC_RN_REPORT_URL: `http://127.0.0.1:${reporterPort}`,
      WEAPP_TW_RN_DEBUG: '1',
    },
    stdout: logFile.createWriteStream(),
    stderr: logFile.createWriteStream(),
    reject: false,
  })
  let browser: Browser | undefined
  try {
    await waitForWeb(expo)
    browser = await selectedBrowser.type.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 1, colorScheme: 'light' })
    semanticPage = page
    await page.goto('http://127.0.0.1:8082', { waitUntil: 'networkidle', timeout: 120_000 })
    await page.getByTestId('tw-rn-root').waitFor()
    const userAgent = await page.evaluate(() => navigator.userAgent)
    const environment = {
      deviceName: `${selectedBrowser.name} ${browser.version()}`,
      osName: await page.evaluate(() => navigator.platform),
      osVersion: userAgent,
      runtimeIdentifier: `expo-web-${selectedBrowser.name}`,
      browser: { name: selectedBrowser.name, version: browser.version() },
      abi: process.arch,
    }
    const enrich = (report: ReactNativeReport): ReactNativeReport => ({
      ...report,
      environment: { ...report.environment, ...environment },
    })

    const baseline = await waitForReport('rn-hmr-baseline', '#10b981')
    const baselineReport = enrich(baseline.report)
    await fs.writeFile(path.join(artifacts, 'report.json'), `${JSON.stringify(baselineReport, null, 2)}\n`, 'utf8')
    semanticReporter.assertReceipts(baselineReport)
    validateReactNativeReport(baselineReport, 'web', { runId, revision: 'rn-hmr-baseline-10b981' })
    await validateNativeArtifacts(baselineReport, artifacts)
    await page.screenshot({ path: path.resolve(artifacts, 'runtime-before.png'), fullPage: true })

    const updatedMarker = originalMarker.replace('rn-hmr-baseline', 'rn-hmr-updated').replace('bg-emerald-500', 'bg-rose-500')
    await fs.writeFile(markerFile, updatedMarker, 'utf8')
    const tsxHmr = await waitForReport('rn-hmr-updated', '#10b981')
    await fs.writeFile(path.join(artifacts, 'report.json'), `${JSON.stringify(enrich(tsxHmr.report), null, 2)}\n`, 'utf8')
    semanticReporter.assertReceipts(tsxHmr.report)
    validateReactNativeReport(enrich(tsxHmr.report), 'web', { runId, revision: 'rn-hmr-updated-10b981' })
    await validateNativeArtifacts(tsxHmr.report, artifacts)
    await page.getByText('rn-hmr-updated').waitFor()
    await page.screenshot({ path: path.resolve(artifacts, 'runtime-tsx-after.png'), fullPage: true })

    const updatedCss = originalCss.replace('#10b981', '#f59e0b')
    if (updatedCss === originalCss) { throw new Error('CSS HMR probe color was not found') }
    await fs.writeFile(cssFile, updatedCss, 'utf8')
    const cssHmr = await waitForReport('rn-hmr-updated', '#f59e0b')
    const cssHmrReport = enrich(cssHmr.report)
    await fs.writeFile(path.join(artifacts, 'report.json'), `${JSON.stringify(cssHmrReport, null, 2)}\n`, 'utf8')
    semanticReporter.assertReceipts(cssHmrReport)
    validateReactNativeReport(cssHmrReport, 'web', { runId, revision: 'rn-hmr-updated-f59e0b' })
    await validateNativeArtifacts(cssHmrReport, artifacts)
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-testid="tw-rn-css-hmr"]')!).backgroundColor === 'rgb(245, 158, 11)')
    await page.screenshot({ path: path.resolve(artifacts, 'runtime-after.png'), fullPage: true })

    const beforeHash = await fileHash(path.resolve(artifacts, 'runtime-before.png'))
    const afterTsxHash = await fileHash(path.resolve(artifacts, 'runtime-tsx-after.png'))
    const afterHash = await fileHash(path.resolve(artifacts, 'runtime-after.png'))
    if (beforeHash === afterTsxHash) { throw new Error('Web TSX HMR screenshot did not change') }
    if (afterTsxHash === afterHash) { throw new Error('Web CSS HMR screenshot did not change') }
    await fs.writeFile(path.resolve(artifacts, 'report-before.json'), `${JSON.stringify(baselineReport, null, 2)}\n`, 'utf8')
    await fs.writeFile(path.resolve(artifacts, 'report.json'), `${JSON.stringify(cssHmrReport, null, 2)}\n`, 'utf8')
    await fs.writeFile(path.resolve(artifacts, 'hmr.json'), `${JSON.stringify({
      beforeMarker: baseline.hmrMarker,
      afterTsxMarker: tsxHmr.hmrMarker,
      beforeCssColor: tsxHmr.cssHmrColor,
      afterCssColor: cssHmr.cssHmrColor,
      beforeScreenshotHash: beforeHash,
      afterTsxScreenshotHash: afterTsxHash,
      afterScreenshotHash: afterHash,
    }, null, 2)}\n`, 'utf8')
    if (updateBaseline) {
      await fs.writeFile(path.resolve(reportsDir, `web-${selectedBrowser.name}.json`), `${JSON.stringify(cssHmrReport, null, 2)}\n`, 'utf8')
    }
  }
  finally {
    await fs.writeFile(markerFile, originalMarker, 'utf8')
    await fs.writeFile(cssFile, originalCss, 'utf8')
    await browser?.close()
    await stopOwnedProcess(expo)
    await expo.catch(() => undefined)
    await logFile.close()
    await reporter.close()
  }
}

try {
  await main()
}
finally {
  await artifactSession.publish()
}
