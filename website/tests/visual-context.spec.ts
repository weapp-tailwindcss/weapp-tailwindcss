import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { expect, test } from '@playwright/test'
import { runLocalCommand } from '../scripts/local-worker/command'

test('keeps real visited links while isolating visual history and runner options', async ({ browserName }, testInfo) => {
  const websiteRoot = path.resolve(path.dirname(testInfo.file), '..')
  const require = createRequire(path.join(websiteRoot, 'package.json'))
  const directory = await mkdtemp(path.join(tmpdir(), 'website-visual-context-'))
  const controller = new AbortController()
  const config = path.join(directory, 'playwright.config.ts')
  const observations = path.join(directory, 'observations.jsonl')
  const requestHeaders: Array<string | string[] | undefined> = []
  const server = createServer((request, response) => {
    requestHeaders.push(request.headers['x-visual-fixture'])
    response.writeHead(200, { 'Content-Type': 'text/html' })
    response.end(request.url === '/destination'
      ? '<body>destination</body>'
      : `<style>body{margin:0}a{display:block;width:30px;height:30px;background:rgb(0,128,255)}a:visited{background:rgb(255,0,0)}</style>
        <a href="/destination" aria-label="Visit target"></a>`)
  })
  const start = performance.now()
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('访问历史回归未获得 TCP 端口')
    }
    const baseURL = `http://127.0.0.1:${address.port}`
    await writeFile(config, `import { defineConfig } from ${JSON.stringify(require.resolve('@playwright/test'))}
      export default defineConfig({
        testDir: ${JSON.stringify(directory)}, testMatch: 'consumer.spec.ts',
        outputDir: ${JSON.stringify(path.join(directory, 'results'))},
        timeout: 20000, retries: 0, workers: 1, reporter: 'line', updateSnapshots: 'none',
        use: {
          browserName: ${JSON.stringify(browserName)}, headless: true,
          baseURL: ${JSON.stringify(baseURL)}, viewport: { width: 411, height: 377 },
          deviceScaleFactor: 2, hasTouch: true, locale: 'fr-FR', colorScheme: 'dark',
          timezoneId: 'Asia/Tokyo', userAgent: 'VisualFixtureContract/1',
          extraHTTPHeaders: { 'X-Visual-Fixture': 'inherited' },
          contextOptions: { reducedMotion: 'reduce', storageState: {
            cookies: [], origins: [{ origin: ${JSON.stringify(baseURL)},
              localStorage: [{ name: 'visual-fixture', value: 'inherited' }] }],
          } },
          video: process.env.VISUAL_CONTRACT_VIDEO === 'on' ? 'on' : 'off',
        },
      })`)
    await writeFile(path.join(directory, 'consumer.spec.ts'), `import { appendFile } from 'node:fs/promises'
      import { expect } from ${JSON.stringify(require.resolve('@playwright/test'))}
      import { PNG } from ${JSON.stringify(require.resolve('pngjs'))}
      import { visualTest as test } from ${JSON.stringify(path.join(websiteRoot, 'tests/helpers/visual-test.ts'))}
      const record = value => appendFile(${JSON.stringify(observations)}, JSON.stringify(value) + '\\n')
      let previousBrowser
      async function pixel(page) {
        const image = PNG.sync.read(await page.locator('a').screenshot({ scale: 'css' }))
        const offset = (15 * image.width + 15) * 4
        return [...image.data.subarray(offset, offset + 4)]
      }
      async function visit(page) {
        await page.locator('a').click()
        await page.waitForURL('**/destination')
        await page.goto('/')
      }
      for (const index of [0, 1]) {
        test('fresh visual document ' + index, async ({ page, browser, browserName }) => {
          const actualBrowser = page.context().browser()
          expect(actualBrowser === browser).toBe(browserName !== 'firefox')
          if (previousBrowser)
            expect(actualBrowser === previousBrowser).toBe(browserName !== 'firefox')
          previousBrowser = actualBrowser
          await page.goto('/')
          expect(await pixel(page)).toEqual([0, 128, 255, 255])
          expect(await page.evaluate(() => ({
            viewport: [innerWidth, innerHeight], scale: devicePixelRatio,
            locale: navigator.language,
            userAgent: navigator.userAgent, zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            dark: matchMedia('(prefers-color-scheme: dark)').matches,
            reduce: matchMedia('(prefers-reduced-motion: reduce)').matches,
            storage: localStorage.getItem('visual-fixture'),
          }))).toEqual({ viewport: [411, 377], scale: 2, locale: 'fr-FR',
            userAgent: 'VisualFixtureContract/1', zone: 'Asia/Tokyo', dark: true,
            reduce: true, storage: 'inherited' })
          if (browserName === 'firefox') {
            const control = await browser.newContext()
            try {
              const controlPage = await control.newPage()
              await controlPage.goto('/')
              await visit(controlPage)
            } finally { await control.close() }
            const next = await browser.newContext()
            try {
              const controlPage = await next.newPage()
              await controlPage.goto('/')
              expect(await pixel(controlPage)).toEqual([255, 0, 0, 255])
            } finally { await next.close() }
            expect(await pixel(page)).toEqual([0, 128, 255, 255])
          }
          await visit(page)
          if (browserName === 'firefox')
            expect(await pixel(page)).toEqual([255, 0, 0, 255])
          await record({ index, browserName, inheritedOptions: true,
            freshHistory: true, visitedWithinTest: browserName === 'firefox', reusedBuiltinBrowser: actualBrowser === browser })
        })
      }
      test('video contract', async ({ page, browser }) => {
        expect(page.context().browser()).toBe(browser)
        await page.goto('/')
        await record({ videoPassthrough: true })
      })`)
    const run = (video: 'on' | 'off') => runLocalCommand({
      command: process.execPath,
      args: [require.resolve('@playwright/test/cli'), 'test', '--config', config, '--grep', video === 'on' ? 'video contract' : 'fresh visual document'],
      cwd: websiteRoot,
      env: { CI: '1', VISUAL_CONTRACT_VIDEO: video },
      stdio: 'pipe',
    }, controller.signal, 55_000 - (performance.now() - start))
    await run('off')
    expect(requestHeaders.length).toBeGreaterThan(0)
    expect(new Set(requestHeaders)).toEqual(new Set(['inherited']))
    const results = (await readFile(observations, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    expect(results).toHaveLength(2)
    expect(results.map(result => result.index)).toEqual([0, 1])
    if (browserName === 'firefox') {
      await expect(run('on')).rejects.toThrow('Firefox 独立视觉 context 暂不支持 video')
    }
    else {
      await run('on')
      expect(await readFile(observations, 'utf8')).toContain('"videoPassthrough":true')
    }
    await testInfo.attach('visual-context-contract', {
      body: JSON.stringify({ browserName, results, videoGuard: browserName === 'firefox' }),
      contentType: 'application/json',
    })
  }
  finally {
    controller.abort(new Error('视觉 context 回归已结束'))
    try {
      await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve())
        server.closeAllConnections()
      })
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
})
