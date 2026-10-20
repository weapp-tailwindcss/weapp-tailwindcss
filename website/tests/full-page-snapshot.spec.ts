import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { expect, test } from '@playwright/test'
import { runLocalCommand } from '../scripts/local-worker/command'

test('preserves native anonymous names and a single whole-image pixel budget', async ({ browserName }, testInfo) => {
  const websiteRoot = path.resolve(path.dirname(testInfo.file), '..')
  const require = createRequire(path.join(websiteRoot, 'package.json'))
  const playwright = require.resolve('@playwright/test')
  const cli = require.resolve('@playwright/test/cli')
  const helper = path.join(websiteRoot, 'tests', 'helpers', 'full-page', 'screenshot.ts')
  const directory = await mkdtemp(path.join(tmpdir(), 'website-snapshot-contract-'))
  const controller = new AbortController()
  const config = path.join(directory, 'playwright.config.ts')
  const snapshots = path.join(directory, 'snapshots')
  const start = performance.now()
  const run = async (mode: string, browser: string) => {
    await runLocalCommand({
      command: process.execPath,
      args: [cli, 'test', '--config', config],
      cwd: websiteRoot,
      env: { CI: '1', CAPTURE_MODE: mode, CAPTURE_BROWSER: browser },
      stdio: 'pipe',
    }, controller.signal, 55_000 - (performance.now() - start))
  }
  try {
    await writeFile(config, `import { defineConfig } from ${JSON.stringify(playwright)}
      export default defineConfig({
        testDir: ${JSON.stringify(directory)}, testMatch: 'consumer.spec.ts',
        outputDir: ${JSON.stringify(path.join(directory, 'results'))},
        snapshotDir: ${JSON.stringify(snapshots)},
        timeout: 60000, retries: 0, workers: 1, reporter: 'line',
        updateSnapshots: process.env.CAPTURE_MODE === 'baseline' ? 'missing' : 'none',
        expect: { timeout: 60000, toHaveScreenshot: {
          maxDiffPixels: 5, pathTemplate: process.env.CAPTURE_MODE === 'templates'
            ? ${JSON.stringify(path.join(directory, 'different', '{arg}{ext}'))} : undefined,
        } },
        projects: [{ name: 'compatibility', use: {
          browserName: process.env.CAPTURE_BROWSER, headless: true,
          viewport: { width: 320, height: 240 }, deviceScaleFactor: 1,
        } }],
      })`)
    await writeFile(path.join(directory, 'consumer.spec.ts'), `import { mkdir, writeFile } from 'node:fs/promises'
      import path from 'node:path'
      import { expect, test } from ${JSON.stringify(playwright)}
      import { expectFullPageScreenshot } from ${JSON.stringify(helper)}
      import { captureStableFullPage } from ${JSON.stringify(path.join(path.dirname(helper), 'stable.ts'))}
      test('anonymous full page', async ({ page, browserName }) => {
        await page.setContent('<style>body{margin:0;height:33001px;background:white}</style>')
        if (process.env.CAPTURE_MODE === 'templates') {
          await expect(expectFullPageScreenshot(page)).rejects.toThrow('模板必须一致')
          return
        }
        if (process.env.CAPTURE_MODE === 'baseline') {
          for (let index = 0; index < 3; index += 1)
            await expect(page).toHaveScreenshot({ fullPage: true })
          return
        }
        if (browserName !== 'firefox')
          page.screenshot = async () => { throw new Error('普通浏览器不得分片') }
        await expectFullPageScreenshot(page)
        await page.evaluate(() => {
          for (const y of [20, 16020, 16030, 32020, 32030]) {
            const pixel = document.createElement('div')
            pixel.style.cssText = 'position:absolute;left:20px;top:' + y + 'px;width:1px;height:1px;background:black'
            document.body.append(pixel)
          }
        })
        await expectFullPageScreenshot(page)
        await page.evaluate(() => {
          const pixel = document.createElement('div')
          pixel.style.cssText = 'position:absolute;left:20px;top:40px;width:1px;height:1px;background:black'
          document.body.append(pixel)
        })
        await expect(expectFullPageScreenshot(page)).rejects.toThrow('6 pixels')
      })
      test('native branches and gradient rasterization', async ({ page }, info) => {
        if (process.env.CAPTURE_MODE !== 'verify')
          return
        await page.setContent('<style>body{margin:0;width:430px;height:911px;background:linear-gradient(35deg,red,blue)}</style>')
        const native = await page.screenshot({ fullPage:true, animations:'disabled', caret:'hide', scale:'css', type:'png' })
        const baseline = info.snapshotPath('gradient.png')
        await mkdir(path.dirname(baseline), { recursive:true })
        await writeFile(baseline, native)
        const tiled = await captureStableFullPage(page, { tileSize:127 })
        expect(tiled).toMatchSnapshot('gradient.png', { maxDiffPixels:5 })
        const screenshotBaseline = info.snapshotPath('native-branches-and-gradient-rasterization-1.png', { kind:'screenshot' })
        await writeFile(screenshotBaseline, native)
        page.screenshot = async () => { throw new Error('尺寸未超限不得分片') }
        await expectFullPageScreenshot(page)
      })
      test('native lazy images reject missing baselines without writing them', async ({ page }) => {
        if (process.env.CAPTURE_MODE !== 'verify')
          return
        await page.route('http://capture.fixture/green.svg', route => route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="20"><rect width="32" height="20" fill="lime"/></svg>',
        }))
        await page.setContent('<style>body{margin:0}div{height:6000px}img{width:32px;height:20px}</style><div></div><img loading="lazy" src="http://capture.fixture/green.svg">')
        await expect(expectFullPageScreenshot(page)).rejects.toThrow('snapshot')
        expect(await page.locator('img').evaluate(image => image.naturalWidth)).toBe(32)
        expect(await page.evaluate(() => scrollY)).toBe(0)
      })`)
    await run('baseline', 'chromium')
    const folder = path.join(snapshots, 'consumer.spec.ts-snapshots')
    const names = (await readdir(folder)).sort()
    expect(names).toEqual([1, 2, 3].map(index => `anonymous-full-page-${index}-compatibility-${process.platform}.png`))
    const before = await Promise.all(names.map(name => readFile(path.join(folder, name))))
    await run('verify', browserName)
    expect((await readdir(folder)).filter(name => name.startsWith('native-lazy-images-'))).toEqual([])
    expect((await readdir(folder)).filter(name => name.startsWith('anonymous-full-page-')).sort()).toEqual(names)
    const after = await Promise.all(names.map(name => readFile(path.join(folder, name))))
    expect(after.every((buffer, index) => buffer.equals(before[index]))).toBe(true)
    await run('templates', 'firefox')
    await testInfo.attach('snapshot-contract', {
      body: JSON.stringify({ names, browserName, totalPixelBudget: 5, sixthPixelRejected: true, splitTemplatesRejected: true }),
      contentType: 'application/json',
    })
  }
  finally {
    controller.abort(new Error('快照契约回归已结束'))
    await rm(directory, { recursive: true, force: true })
  }
})
