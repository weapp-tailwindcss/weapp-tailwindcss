import { readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect, it, vi } from 'vitest'
import { runLocalCommand } from '../local-worker/command'
import { digest, pngRecord } from './files'
import * as identity from './identity'
import { candidateImages, installCandidates, installedDirectory, reviewCandidates, verifyInstalledBaselines } from './install'
import { snapshotBindings } from './report'
import { baselineFixture } from './test-support'

it('三浏览器原生 missing 附件可安装，严格 none 在渲染改变后失败且不改黄金图', async () => {
  const fixture = await baselineFixture()
  const { root, websiteRoot, directory, cases } = fixture
  try {
    await writeFile(path.join(websiteRoot, 'package.json'), JSON.stringify({ type: 'module' }))
    await rm(path.join(directory, 'snapshots'), { recursive: true })
    const realWebsiteRoot = fileURLToPath(new URL('../..', import.meta.url))
    const require = createRequire(pathToFileURL(path.join(realWebsiteRoot, 'package.json')))
    const testApi = pathToFileURL(require.resolve('@playwright/test')).href
    const helper = pathToFileURL(path.join(realWebsiteRoot, 'tests', 'helpers', 'full-page', 'screenshot.ts')).href
    const config = path.join(root, 'playwright.config.mts')
    const spec = path.join(websiteRoot, 'tests', 'index.spec.ts')
    const reportFile = path.join(directory, 'report.json')
    const snapshots = path.join(directory, 'snapshots')
    await writeFile(spec, `
      import api from ${JSON.stringify(testApi)}
      const { test } = api
      import { expectFullPageScreenshot } from ${JSON.stringify(helper)}
      for (const viewport of ['desktop', 'mobile']) {
        test.describe(viewport + ' viewport', () => {
          test(viewport + ' / screenshot', async ({page, browserName}) => {
            test.skip(viewport === 'mobile' && browserName !== 'chromium', 'Only run on chromium to keep the suite fast')
            await page.setViewportSize({width: 320, height: 240})
            await page.setContent('<style>body{margin:0;background:#e8e8e8}.probe{width:100%;height:' + (browserName === 'firefox' ? 33000 : 500) + 'px;background:linear-gradient(red,blue)}</style><div class="probe"></div>')
            await expectFullPageScreenshot(page)
          })
        })
      }
    `)
    const writeConfig = (snapshotDir: string) => writeFile(config, `
      import api from ${JSON.stringify(testApi)}
      const {defineConfig} = api
      export default defineConfig({testDir:${JSON.stringify(path.dirname(spec))},testMatch:'index.spec.ts',snapshotDir:${JSON.stringify(snapshotDir)},outputDir:${JSON.stringify(path.join(root, 'results'))},reporter:[['json',{outputFile:${JSON.stringify(reportFile)}}]],workers:1,retries:0,timeout:60000,use:{headless:true},expect:{toHaveScreenshot:{maxDiffPixels:5}},projects:['chromium','firefox','webkit'].map(name=>({name,use:{browserName:name,headless:true}}))})
    `)
    const command = (mode: string) => ({ command: process.execPath, args: [require.resolve('@playwright/test/cli'), 'test', '--config', config, `--update-snapshots=${mode}`], cwd: realWebsiteRoot, stdio: 'pipe' as const, env: { CI: '1' } })
    await writeConfig(snapshots)
    await runLocalCommand(command('missing'), new AbortController().signal, 120_000)
    const report = await readFile(reportFile)
    const bindings = snapshotBindings(JSON.parse(report.toString()), snapshots, cases)
    expect(bindings).toHaveLength(4)
    const images = []
    for (const binding of bindings) {
      images.push({ ...binding, ...await pngRecord(candidateImages(directory), binding.file) })
    }
    expect(images.find(item => item.project === 'firefox')!.height).toBeGreaterThan(32_767)
    const environment = await identity.renderEnvironment(realWebsiteRoot)
    vi.spyOn(identity, 'renderEnvironment').mockResolvedValue(environment)
    await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ ...fixture.manifest, environment, source: { ...fixture.manifest.source, contract: await identity.baselineContract(websiteRoot) }, reportSha256: digest(report), images }))
    await reviewCandidates(directory, websiteRoot, '自动化夹具', '红蓝渐变与长图分片仅验证采集管线，不能作为站点基线', [path.join(candidateImages(directory), images[0]!.file)])
    await installCandidates(directory, websiteRoot)
    await verifyInstalledBaselines(websiteRoot)
    const golden = await readFile(path.join(installedDirectory(websiteRoot), images[0]!.file))
    await writeConfig(path.join(websiteRoot, 'tests'))
    await runLocalCommand(command('none'), new AbortController().signal, 120_000)
    await writeFile(spec, (await readFile(spec, 'utf8')).replace('linear-gradient(red,blue)', 'linear-gradient(green,blue)'))
    await expect(runLocalCommand(command('none'), new AbortController().signal, 120_000)).rejects.toThrow('本地命令失败')
    expect(await readFile(path.join(installedDirectory(websiteRoot), images[0]!.file))).toEqual(golden)
  }
  finally {
    vi.restoreAllMocks()
    await rm(root, { recursive: true, force: true })
  }
}, 180_000)
