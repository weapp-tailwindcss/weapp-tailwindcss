import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
    const url = new URL(request.url ?? '/', 'http://visual-fixture.invalid')
    const fixtureCase = encodeURIComponent(url.searchParams.get('case') ?? '0')
    response.writeHead(200, { 'Content-Type': 'text/html' })
    response.end(url.pathname === '/destination'
      ? '<body>destination</body>'
      : `<style>body{margin:0}a{display:block;width:30px;height:30px;background:rgb(0,128,255)}a:visited{background:rgb(255,0,0)}</style>
        <a href="/destination?case=${fixtureCase}" aria-label="Visit target"></a>
        <a href="/untouched?case=${fixtureCase}" aria-label="Unvisited target"></a>`)
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
      import path from 'node:path'
      export default defineConfig({
        testDir: ${JSON.stringify(directory)}, testMatch: 'consumer.spec.ts',
        outputDir: ${JSON.stringify(path.join(directory, 'results'))},
        timeout: 20000, retries: 0, workers: 1, updateSnapshots: 'none',
        reporter: [['line'], ['json', { outputFile: path.join(${JSON.stringify(directory)}, 'consumer-report-' + process.env.VISUAL_CONTRACT_VIDEO + '.json') }]],
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
          trace: 'retain-on-failure', screenshot: 'only-on-failure',
        },
      })`)
    await writeFile(path.join(directory, 'consumer.spec.ts'), `import { appendFile, writeFile } from 'node:fs/promises'
      import { expect } from ${JSON.stringify(require.resolve('@playwright/test'))}
      import { PNG } from ${JSON.stringify(require.resolve('pngjs'))}
      import { visualTest as test } from ${JSON.stringify(path.join(websiteRoot, 'tests/helpers/visual-test.ts'))}
      const record = value => appendFile(${JSON.stringify(observations)}, JSON.stringify(value) + '\\n')
      const blue = [0, 128, 255, 255], red = [255, 0, 0, 255]
      const counts = new Map()
      let previousBrowser
      class PixelStateTimeoutError extends Error {
        constructor(label, samples, cause) {
          super(label + ' did not render the exact expected RGBA', { cause })
          this.name = 'PixelStateTimeoutError'
          this.samples = samples
        }
      }
      async function pixel(page, label, linkName = 'Visit target') {
        const index = counts.get(label) ?? 0
        counts.set(label, index + 1)
        const startedAt = performance.now()
        const bytes = await page.getByRole('link', { name: linkName, exact: true }).screenshot({ scale: 'css' })
        const image = PNG.sync.read(bytes)
        const offset = (15 * image.width + 15) * 4
        const sample = { label, index, startedAt, endedAt: performance.now(),
          rgba: [...image.data.subarray(offset, offset + 4)] }
        await writeFile(test.info().outputPath(label + '-' + index + '.png'), bytes)
        await record({ kind: 'pixel', ...sample })
        return sample.rgba
      }
      async function expectPixel(page, expected, label, linkName = 'Visit target', timeout = 2000) {
        const samples = []
        let captureError
        try {
          // 导航完成不承诺 visited 已绘制；只观察同一页面，首样本和每次截图都保留。
          await expect.poll(async () => {
            if (captureError) throw captureError
            try {
              const rgba = await pixel(page, label, linkName)
              samples.push(rgba)
              return rgba
            } catch (error) {
              captureError = error
              await record({ kind: 'capture-error', label, error: error.message })
              throw error
            }
          }, { timeout, message: label + ' must render exact RGBA' }).toEqual(expected)
        } catch (error) {
          if (captureError) throw captureError
          throw new PixelStateTimeoutError(label, samples, error)
        } finally {
          const body = JSON.stringify({ label, expected, timeout, samples,
            captureError: captureError?.message })
          await writeFile(test.info().outputPath(label + '.json'), body)
          await test.info().attach(label, { body, contentType: 'application/json' })
        }
      }
      async function visit(page, home) {
        const source = new URL(page.url())
        await page.getByRole('link', { name: 'Visit target', exact: true }).click()
        await page.waitForURL(url => url.pathname === '/destination' && url.search === source.search)
        await page.goto(home)
      }
      for (const index of [0, 1]) {
        test('fresh visual document ' + index, async ({ page, browser, browserName }) => {
          const actualBrowser = page.context().browser()
          expect(actualBrowser === browser).toBe(browserName !== 'firefox')
          if (previousBrowser)
            expect(actualBrowser === previousBrowser).toBe(browserName !== 'firefox')
          previousBrowser = actualBrowser
          const home = '/?case=' + index
          await page.goto(home)
          expect(await pixel(page, 'visual-initial')).toEqual(blue)
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
              await controlPage.goto(home)
              expect(await pixel(controlPage, 'control-initial')).toEqual(blue)
              await visit(controlPage, home)
              await expectPixel(controlPage, red, 'control-visited')
              expect(await pixel(controlPage, 'control-unvisited', 'Unvisited target')).toEqual(blue)
            } finally { await control.close() }
            const next = await browser.newContext()
            try {
              const controlPage = await next.newPage()
              await controlPage.goto(home)
              await expectPixel(controlPage, red, 'inherited-visited')
              expect(await pixel(controlPage, 'inherited-unvisited', 'Unvisited target')).toEqual(blue)
            } finally { await next.close() }
            expect(await pixel(page, 'visual-after-control')).toEqual(blue)
            let unvisitedError
            try { await expectPixel(page, red, 'unvisited-negative', 'Unvisited target', 300) }
            catch (error) { unvisitedError = error }
            expect(unvisitedError).toBeInstanceOf(PixelStateTimeoutError)
            expect(unvisitedError.samples.length).toBeGreaterThan(0)
            expect(unvisitedError.samples.every(rgba => JSON.stringify(rgba) === JSON.stringify(blue))).toBe(true)
          }
          await visit(page, home)
          if (browserName === 'firefox') {
            await expectPixel(page, red, 'visual-visited')
            expect(await pixel(page, 'visual-unvisited', 'Unvisited target')).toEqual(blue)
          }
          await record({ kind: 'result', index, browserName, inheritedOptions: true,
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
      args: [require.resolve('@playwright/test/cli'), 'test', '--config', config, '--grep', video === 'on' ? 'video contract' : 'fresh visual document', '--output', path.join(directory, `results-${video}`)],
      cwd: websiteRoot,
      env: {
        CI: '1',
        VISUAL_CONTRACT_VIDEO: video,
        PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(directory, `consumer-report-${video}.json`),
      },
      stdio: 'pipe',
    }, controller.signal, 55_000 - (performance.now() - start))
    await run('off')
    expect(requestHeaders.length).toBeGreaterThan(0)
    expect(new Set(requestHeaders)).toEqual(new Set(['inherited']))
    const samples = (await readFile(observations, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    const results = samples.filter(sample => sample.kind === 'result')
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
    await testInfo.attach('visual-context-observations', { path: observations, contentType: 'application/x-ndjson' })
    await cp(directory, testInfo.outputPath('consumer'), { recursive: true })
  }
  catch (error) {
    try {
      await cp(directory, testInfo.outputPath('consumer'), { recursive: true })
    }
    catch (copyError) {
      throw new AggregateError([error, copyError], '视觉消费失败，且子夹具证据复制失败')
    }
    throw error
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
