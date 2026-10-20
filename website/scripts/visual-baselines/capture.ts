import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { localBrowserCommand } from '../browser-local'
import { verifyWorkerRoutes } from '../local-worker/assertions'
import { discoverBrowserBudget } from '../local-worker/browser-budget'
import { runLocalCommand } from '../local-worker/command'
import { withLocalWorker } from '../local-worker/server'
import { digest, exactNames, pngRecord, regularBytes, treeFiles } from './files'
import { captureIdentity, renderEnvironment } from './identity'
import { candidateImages } from './install'
import { visualCases } from './manifest'
import { snapshotBindings } from './report'

export async function captureCandidates(directory: string, websiteRoot: string) {
  const source = await captureIdentity(websiteRoot)
  const environment = await renderEnvironment(websiteRoot)
  await mkdir(directory)
  const startedAt = new Date().toISOString()
  await writeFile(path.join(directory, 'capture-started.json'), `${JSON.stringify({ source, environment, startedAt }, null, 2)}\n`)
  try {
    const require = createRequire(pathToFileURL(path.join(websiteRoot, 'package.json')))
    const config = path.join(directory, 'playwright.config.mts')
    await writeFile(config, [
      `import api from ${JSON.stringify(pathToFileURL(require.resolve('@playwright/test')).href)}`,
      'const { defineConfig } = api',
      `import base from ${JSON.stringify(pathToFileURL(path.join(websiteRoot, 'scripts', 'local-worker', 'playwright.config.mts')).href)}`,
      `export default defineConfig({ ...base, testMatch: 'index.spec.ts', grep: /viewport.* screenshot$/, snapshotDir: ${JSON.stringify(path.join(directory, 'snapshots'))}, outputDir: ${JSON.stringify(path.join(directory, 'results'))}, reporter: [['line'], ['json', {outputFile: ${JSON.stringify(path.join(directory, 'report.json'))}}]], updateSnapshots: 'missing' })`,
    ].join('\n'))
    await withLocalWorker(async (context) => {
      await verifyWorkerRoutes(context)
      const base = localBrowserCommand(context)
      const command = { ...base, args: [base.args[0]!, 'test', '--config', config, '--project=chromium', '--project=firefox', '--project=webkit', '--update-snapshots=missing'] }
      const budget = await discoverBrowserBudget(command, context.signal)
      await runLocalCommand(command, context.signal, budget.timeoutMs)
    }, { websiteRoot })
    if (JSON.stringify(await captureIdentity(websiteRoot)) !== JSON.stringify(source)) {
      throw new Error('采集期间源码、锁文件或实际构建发生变化，候选不可安装')
    }
    const reportBytes = await regularBytes(path.join(directory, 'report.json'))
    const cases = await visualCases(websiteRoot)
    const bindings = snapshotBindings(JSON.parse(reportBytes.toString()), path.join(directory, 'snapshots'), cases)
    exactNames(await treeFiles(candidateImages(directory)), bindings.map(item => item.file))
    const images = []
    for (const binding of bindings) {
      images.push({ ...binding, ...await pngRecord(candidateImages(directory), binding.file) })
    }
    await writeFile(path.join(directory, 'manifest.json'), `${JSON.stringify({ version: 1, capturedAt: new Date().toISOString(), source, environment, reportSha256: digest(reportBytes), snapshotRoot: path.join(directory, 'snapshots'), skipped: cases.filter(item => item.skipped).map(item => `${item.project}:${item.title}`), images }, null, 2)}\n`, { flag: 'wx' })
  }
  catch (error) {
    await writeFile(path.join(directory, 'capture-failed.json'), `${JSON.stringify({ error: String(error), at: new Date().toISOString() }, null, 2)}\n`)
    throw error
  }
}
