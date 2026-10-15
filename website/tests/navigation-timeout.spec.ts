import { Buffer } from 'node:buffer'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { expect, test } from '@playwright/test'
import { runLocalCommand } from '../scripts/local-worker/command'

for (const mode of ['poll', 'hard'] as const) {
  test(`真实 headless ${mode} 预算截止保留原错误和首 attempt 证据`, async ({ browserName }, testInfo) => {
    const websiteRoot = path.resolve(path.dirname(testInfo.file), '..')
    test.setTimeout(30_000)
    const directory = await mkdtemp(path.join(os.tmpdir(), 'website-navigation-timeout-'))
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let childFailure: unknown
    const server = createServer((request, response) => {
      if (request.url === '/pending' || request.url === '/pending-runtime') {
        void gate.then(() => response.end('released'))
        return
      }
      response.writeHead(200, { 'Content-Type': 'text/html' })
      response.end(`<!doctype html><html data-has-hydrated="true"><body><script>fetch('/pending')</script>
        ${mode === 'hard' ? '<script src="/pending-runtime"></script>' : ''}</body></html>`)
    })
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', resolve)
      })
      const address = server.address()
      if (!address || typeof address === 'string') {
        throw new Error('HTTP fixture 未获得 TCP 端口')
      }
      const url = `http://127.0.0.1:${address.port}/`
      const reportPath = path.join(directory, 'report.json')
      const playwrightUrl = pathToFileURL(path.join(websiteRoot, 'node_modules', '@playwright', 'test', 'index.mjs')).href
      const configPath = path.join(directory, 'playwright.config.mts')
      await writeFile(path.join(directory, 'package.json'), JSON.stringify({ type: 'module' }))
      await writeFile(configPath, `
        import { defineConfig } from ${JSON.stringify(playwrightUrl)}
        import config from ${JSON.stringify(pathToFileURL(path.join(websiteRoot, 'scripts', 'local-worker', 'playwright.config.mts')).href)}
        export default defineConfig({ ...config, testDir: ${JSON.stringify(directory)}, testMatch: '**/timeout.spec.ts', outputDir: ${JSON.stringify(path.join(directory, 'results'))}, reporter: [['json', { outputFile: ${JSON.stringify(reportPath)} }]] })
      `)
      await writeFile(path.join(directory, 'timeout.spec.ts'), `
        import { test } from ${JSON.stringify(playwrightUrl)}
        import { navigateWebsite } from ${JSON.stringify(pathToFileURL(path.join(websiteRoot, 'tests', 'helpers', 'navigation.ts')).href)}
        let context
        let page
        test.beforeAll(async ({ browser }) => {
          context = await browser.newContext()
          page = await context.newPage()
        })
        test.afterAll(async () => {
          await context?.close()
        })
        test('pending resource at whole-test timeout', async () => {
          test.setTimeout(1500)
          await navigateWebsite(page, ${JSON.stringify(url)})
        })
      `)
      const require = createRequire(path.join(websiteRoot, 'package.json'))
      const failure = await runLocalCommand({
        command: process.execPath,
        args: [require.resolve('@playwright/test/cli'), 'test', '--config', configPath, `--project=${browserName}`],
        cwd: websiteRoot,
        env: { CI: '1', FORCE_COLOR: '0' },
        stdio: 'pipe',
      }, new AbortController().signal, 20_000).then(() => undefined, error => error)
      childFailure = failure
      expect(failure?.message).toContain('exit=1 signal=null')
      const report = JSON.parse(await readFile(reportPath, 'utf8'))
      expect(report.errors).toEqual([{ message: 'Testing stopped early after 1 maximum allowed failures.' }])
      const attempts = report.suites.flatMap((suite: { specs: Array<{ tests: Array<{ results: unknown[] }> }> }) => suite.specs.flatMap(spec => spec.tests.flatMap(test => test.results)))
      expect(attempts).toHaveLength(1)
      const attempt = attempts[0]
      expect(attempt.retry).toBe(0)
      expect(attempt.status).toBe(mode === 'hard' ? 'timedOut' : 'failed')
      expect(attempt.error.message).toMatch(/Test timeout of 1500ms exceeded/)
      const trace = attempt.attachments.find((attachment: { name: string }) => attachment.name === 'trace')
      expect(trace).toBeDefined()
      expect((await readFile(trace.path)).byteLength).toBeGreaterThan(0)
      const state = attempt.attachments.find((attachment: { name: string }) => attachment.name === 'website-navigation-state.json')
      if (mode === 'poll') {
        expect(state, 'poll 预算截止仍须保留 helper 首失败附件').toBeDefined()
        const diagnostic = JSON.parse(state.body ? Buffer.from(state.body, 'base64').toString() : await readFile(state.path, 'utf8'))
        expect(diagnostic.error.message).toContain('Test timeout of 1500ms exceeded')
        expect(diagnostic.pending.requests).toEqual(expect.arrayContaining([expect.objectContaining({ url: new URL('/pending', url).href })]))
        expect(diagnostic.readiness.stage).toBe('resources-or-idle')
      }
    }
    catch (error) {
      try {
        await testInfo.attach('timeout-child-error', { body: String(childFailure), contentType: 'text/plain' })
        const reportBytes = await readFile(path.join(directory, 'report.json'))
        await testInfo.attach('timeout-child-report', { body: reportBytes, contentType: 'application/json' })
        const childReport = JSON.parse(reportBytes.toString())
        for (const suite of childReport.suites) {
          for (const spec of suite.specs) {
            for (const childTest of spec.tests) {
              for (const attempt of childTest.results) {
                for (const attachment of attempt.attachments) {
                  if (attachment.name === 'trace') {
                    await testInfo.attach('timeout-child-trace', { body: await readFile(attachment.path), contentType: 'application/zip' })
                  }
                }
              }
            }
          }
        }
      }
      catch (attachmentError) {
        console.error('超时子 runner 证据附加失败', attachmentError)
      }
      throw error
    }
    finally {
      release()
      await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve())
        server.closeAllConnections()
      })
      await rm(directory, { recursive: true, force: true })
    }
  })
}
