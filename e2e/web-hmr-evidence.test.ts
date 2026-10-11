import type { Browser } from 'playwright'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withWebHmrEvidence } from './web-hmr/evidence'

describe('Web HMR evidence lifecycle', () => {
  let browser: Browser
  let root: string
  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'web-hmr-evidence-'))
    browser = await chromium.launch({ headless: true })
  })
  afterAll(async () => {
    await browser?.close()
    if (root) {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('records changed screenshots and computed styles from the same page', async () => {
    const page = await browser.newPage()
    const artifactRoot = path.join(root, 'success')
    await page.setContent('<main style="background: rgb(0, 255, 0); height: 200px">before</main>')
    await withWebHmrEvidence({ artifactRoot, caseName: 'success', page, projectRoot: root, selector: 'main', serverLogs: () => ['server-ready'] }, async (capture) => {
      await capture('before')
      await page.locator('main').evaluate((element) => {
        element.textContent = 'after'
        ;(element as HTMLElement).style.backgroundColor = 'rgb(255, 0, 0)'
      })
    })
    const [directory] = await fs.readdir(artifactRoot)
    const report = JSON.parse(await fs.readFile(path.join(artifactRoot, directory!, 'report.json'), 'utf8'))
    expect(report.status).toBe('assertions-passed')
    expect(report.captures.map((item: { state: { backgroundColor: string } }) => item.state.backgroundColor)).toEqual(['rgb(0, 255, 0)', 'rgb(255, 0, 0)'])
    expect(report.captures[0].sha256).not.toBe(report.captures[1].sha256)
    expect(report.captures[0].targetScreenshot.sha256).not.toBe(report.captures[1].targetScreenshot.sha256)
    expect(report.serverLogs).toEqual(['server-ready'])
    expect(page.isClosed()).toBe(false)
    await page.close()
  })

  it('captures a marker outside the viewport in an internal scrolling container', async () => {
    const page = await browser.newPage({ viewport: { width: 400, height: 300 } })
    const artifactRoot = path.join(root, 'scroll')
    await page.setContent('<section style="height: 250px; overflow:auto"><div style="height:1000px"></div><main style="height:100px; background:red">offscreen HMR</main></section>')
    await withWebHmrEvidence({ artifactRoot, caseName: 'scroll', page, projectRoot: root, selector: 'main', serverLogs: () => [] }, async (capture) => {
      await capture('before')
    })
    const [directory] = await fs.readdir(artifactRoot)
    const report = JSON.parse(await fs.readFile(path.join(artifactRoot, directory!, 'report.json'), 'utf8'))
    const target = report.captures[0].targetScreenshot
    expect(report.captures[0].state.text).toBe('offscreen HMR')
    expect((await fs.stat(path.join(artifactRoot, directory!, target.filename))).size).toBeGreaterThan(0)
    await page.close()
  })

  it('preserves a failed assertion while recording diagnostics and failure screenshot', async () => {
    const page = await browser.newPage()
    const artifactRoot = path.join(root, 'failure')
    const failure = new Error('original assertion failure')
    await page.setContent('<main>failed page</main>')
    await expect(withWebHmrEvidence({ artifactRoot, caseName: 'failure', page, projectRoot: root, serverLogs: () => ['compile-failed'] }, async (capture) => {
      await capture('before')
      await page.evaluate('console.error("browser-diagnostic")')
      throw failure
    })).rejects.toBe(failure)
    const [directory] = await fs.readdir(artifactRoot)
    const report = JSON.parse(await fs.readFile(path.join(artifactRoot, directory!, 'report.json'), 'utf8'))
    expect(report.status).toBe('failed')
    expect(report.failure).toContain(failure.message)
    expect(report.diagnostics).toContain('[console:error] browser-diagnostic')
    expect(report.captures.map((item: { stage: string }) => item.stage)).toEqual(['before', 'failure'])
    expect(page.isClosed()).toBe(false)
    await page.close()
  })
})
