import { Buffer } from 'node:buffer'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { PNG } from 'pngjs'
import { digest, pngRecord } from './files'
import { baselineContract } from './identity'
import { candidateImages } from './install'
import { expectedVisualCases } from './report'

export const environment = { platform: 'linux' as const, arch: 'x64' as const, release: 'fixture-release', playwright: '1.64.1', browsers: { chromium: 'fixture-chromium', firefox: 'fixture-firefox', webkit: 'fixture-webkit' }, imageDecoder: { sharp: 'fixture-sharp', vips: 'fixture-vips' } }

export async function baselineFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'visual-baseline-中文-'))
  const websiteRoot = path.join(root, 'website')
  const directory = path.join(root, 'candidate')
  await mkdir(path.join(websiteRoot, 'tests', 'helpers'), { recursive: true })
  await mkdir(path.join(websiteRoot, 'scripts', 'local-worker'), { recursive: true })
  await mkdir(path.join(root, 'scripts', 'e2e-preflight'), { recursive: true })
  await writeFile(path.join(root, 'scripts', 'e2e-preflight', 'cleanup.ts'), 'fixture-lifecycle')
  await mkdir(candidateImages(directory), { recursive: true })
  for (const file of ['playwright.config.mts', 'scripts/local-worker/playwright.config.mts', 'tests/index.spec.ts', 'tests/helpers/screenshot.ts']) {
    await writeFile(path.join(websiteRoot, file), 'fixture-contract')
  }
  await writeFile(path.join(websiteRoot, 'routes.json'), '["/"]')
  const cases = expectedVisualCases(['/'])
  const image = new PNG({ width: 2, height: 2 })
  image.data = Buffer.from([255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255])
  const png = PNG.sync.write(image)
  const report = { errors: [], suites: [{ specs: cases.map(item => ({ title: item.title, tests: [{ projectName: item.project, expectedStatus: item.skipped ? 'skipped' : 'passed', results: [{ status: item.skipped ? 'skipped' : 'passed', retry: 0, errors: [], attachments: item.skipped ? [] : [{ name: 'native-anonymous-1-expected.png', contentType: 'image/png', path: path.join(candidateImages(directory), `${item.project}-${item.viewport}-1.png`) }] }] }] })) }] }
  const images = []
  for (const item of cases.filter(item => !item.skipped)) {
    const file = `${item.project}-${item.viewport}-1.png`
    await writeFile(path.join(candidateImages(directory), file), png)
    images.push({ ...item, ...await pngRecord(candidateImages(directory), file) })
  }
  const reportBytes = JSON.stringify(report)
  await writeFile(path.join(directory, 'report.json'), reportBytes)
  const manifest = { version: 1, capturedAt: new Date().toISOString(), source: { head: 'a'.repeat(40), lock: 'b'.repeat(64), build: 'c'.repeat(64), contract: await baselineContract(websiteRoot), node: process.version }, environment, reportSha256: digest(reportBytes), snapshotRoot: path.join(directory, 'snapshots'), skipped: cases.filter(item => item.skipped).map(item => `${item.project}:${item.title}`), images }
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest))
  return { root, websiteRoot, directory, manifest, report, cases, png }
}
