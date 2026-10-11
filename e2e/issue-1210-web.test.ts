import type { ChildProcess } from 'node:child_process'
import type { Page } from 'playwright'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { normalizePath } from 'vite'
import { describe, expect, it } from 'vitest'
import { cleanupHBuilderXResources } from '../scripts/hbuilderx-project-resources'
import { collectProcessOutput, findFreePort, killProcessTree, resolveBaseUrls } from './hbuilderx-local/process'
import { cleanupWebHmrSession } from './hbuilderx-local/web/cleanup'
import { createDevServer, createHBuilderXDevServer } from './hbuilderx-local/web/dev-server'

const enabled = process.env.E2E_ISSUE_1210 === '1'
const ide = process.env.E2E_ISSUE_1210_HBUILDERX === '1'
const production = process.env.E2E_ISSUE_1210_PRODUCTION === '1'
const projectRoot = path.resolve(__dirname, '../demo/uni-app-x-vdom-tailwindcss-v4')
const sourceFile = path.join(projectRoot, 'pages', 'issue-1210', 'index.uvue')
const artifactDir = path.resolve(__dirname, '.artifacts/issue-1210', production ? 'production' : ide ? 'hbuilderx' : 'portable')

async function styles(page: Page) {
  return page.evaluate(() => Object.fromEntries(
    [...document.querySelectorAll('[id^="issue-1210-"]')].map((node) => {
      const style = getComputedStyle(node)
      return [node.id.replace('issue-1210-', ''), {
        background: style.backgroundImage,
        shadow: style.boxShadow,
        filter: style.filter,
      }]
    }),
  ))
}

async function assertInitial(page: Page) {
  await expect.poll(async () => (await styles(page)).two?.background).toContain('rgb(0, 183, 215) 0%')
  const result = await styles(page)
  expect(result.two.background).toContain('rgb(48, 128, 255) 100%')
  expect(result.via.background).toContain('rgb(251, 44, 54) 50%')
  expect(result.position.background).toContain('20%')
  expect(result.position.background).toContain('80%')
  expect(result.shadow.shadow).not.toBe('none')
  const redShadow = await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.boxShadow = '0 4px 6px -1px color-mix(in oklab, rgb(251, 44, 54) 100%, transparent), 0 2px 4px -2px color-mix(in oklab, rgb(251, 44, 54) 100%, transparent)'
    document.body.append(probe)
    const value = getComputedStyle(probe).boxShadow
    probe.remove()
    return value
  })
  expect(result.colored.shadow).toContain(redShadow)
  expect(result.colored.shadow).not.toBe(result.shadow.shadow)
  expect(result.ring.shadow).toContain('48, 128, 255')
  expect(result.ring.shadow).toContain('2px')
  expect(result.drop.filter).toContain('drop-shadow')
  expect(result.apply.background).toBe(result.two.background)
  expect(result.apply.shadow).toBe(result.shadow.shadow)
  expect(result.author.background).toContain('linear-gradient')
}

describe.runIf(enabled)('issue #1210 uni-app x Web', () => {
  it('preserves runtime defaults through scoped SCSS, build and same-process HMR', async () => {
    await mkdir(artifactDir, { recursive: true })
    const original = await readFile(sourceFile, 'utf8')
    let ownedSource = original
    let child: ChildProcess | undefined
    let cleanup: (() => Promise<void>) | undefined
    let stopServer: (() => Promise<void>) | undefined
    let failure: { error: unknown } | undefined
    let logs: string[] = []
    const errors: string[] = []
    const requests: string[] = []
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 780, height: 1100 } })
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => logs.push(`[browser:${message.type()}] ${message.text()}`))
    page.on('requestfailed', request => requests.push(`${request.url()}: ${request.failure()?.errorText}`))
    try {
      let baseUrl = process.env.E2E_ISSUE_1210_URL
      if (production) {
        expect(baseUrl, '生产验收必须提供已构建产物的预览 URL').toBeTruthy()
      }
      if (!baseUrl) {
        if (ide) {
          const server = await createHBuilderXDevServer(projectRoot)
          child = server.child
          cleanup = server.cleanup
          stopServer = () => server.stop()
        }
        else {
          const port = await findFreePort()
          child = createDevServer(projectRoot, port)
          baseUrl = `http://127.0.0.1:${port}`
        }
        logs = collectProcessOutput(child, 2000)
      }
      await expect.poll(async () => {
        const urls = baseUrl ? [baseUrl] : resolveBaseUrls(logs, '').filter(Boolean)
        for (const url of urls) {
          try {
            const response = await fetch(url, { signal: AbortSignal.timeout(2000) })
            if (response.ok) {
              baseUrl = url
              return true
            }
          }
          catch {}
        }
        return false
      }, { timeout: 180_000, interval: 500 }).toBe(true)
      await page.goto(`${baseUrl!.replace(/\/$/, '')}/#/pages/issue-1210/index`)
      await page.locator('#issue-1210-marker').waitFor()
      if (!production) {
        const identities = await page.locator('style[data-vite-dev-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-vite-dev-id')))
        expect(identities.some(id => id?.includes(normalizePath(projectRoot)))).toBe(true)
      }
      await assertInitial(page)
      const save = async (round: string) => {
        await page.screenshot({ path: path.join(artifactDir, `${round}.png`), fullPage: true })
        await writeFile(path.join(artifactDir, `${round}.json`), JSON.stringify(await styles(page), null, 2))
        const css = await page.evaluate(() => [...document.styleSheets].map((sheet) => {
          try {
            return [...sheet.cssRules].map(rule => rule.cssText).join('\n')
          }
          catch {
            return `/* inaccessible: ${sheet.href} */`
          }
        }).join('\n'))
        await writeFile(path.join(artifactDir, `${round}.css`), css)
      }
      await save('initial')
      if (!production) {
        const initial = (await styles(page)).two.background
        let replacement = ''
        for (const round of ['replace', 'add', 'restore']) {
          const utility = round === 'restore'
            ? 'from-cyan-500 to-blue-500'
            : round === 'replace' ? 'from-emerald-500 to-blue-500' : 'from-emerald-500 via-red-500 to-blue-500'
          const next = original.replace('from-cyan-500 to-blue-500', utility)
            .replace('issue-1210-initial', `issue-1210-${round}`)
          expect(await readFile(sourceFile, 'utf8')).toBe(ownedSource)
          await writeFile(sourceFile, next)
          ownedSource = next
          await expect.poll(() => page.locator('#issue-1210-marker').textContent(), { timeout: 60_000 }).toBe(`issue-1210-${round}`)
          await expect.poll(async () => {
            const current = (await styles(page)).two.background
            if (round === 'restore') {
              return current === initial
            }
            return current.includes('linear-gradient') && current !== initial
              && current.includes('rgb(0, 187, 127) 0%') && current.includes('rgb(48, 128, 255) 100%')
              && (round !== 'add' || (current !== replacement && current.includes('rgb(251, 44, 54) 50%')))
          }, { timeout: 60_000 }).toBe(true)
          if (round === 'replace') {
            replacement = (await styles(page)).two.background
          }
          await save(round)
        }
        await page.reload()
        await assertInitial(page)
        await save('refresh')
      }
      expect(errors).toEqual([])
    }
    catch (error) {
      failure = { error }
      await writeFile(path.join(artifactDir, 'failure.html'), await page.content().catch(() => '')).catch(() => {})
      await page.screenshot({ path: path.join(artifactDir, 'failure.png'), fullPage: true }).catch(() => {})
    }
    finally {
      try {
        await cleanupHBuilderXResources([
          () => writeFile(path.join(artifactDir, 'server-browser.log'), logs.join('\n')),
          () => writeFile(path.join(artifactDir, 'errors.json'), JSON.stringify({ errors, requests }, null, 2)),
          () => cleanupWebHmrSession({
            closeBrowser: () => browser.close(),
            stopServer: async () => {
              if (stopServer) {
                await stopServer()
              }
              else if (child) {
                killProcessTree(child)
              }
            },
            restoreSource: async () => {
              if (ownedSource !== original && await readFile(sourceFile, 'utf8') === ownedSource) {
                await writeFile(sourceFile, original)
              }
            },
            closeProject: async () => { await cleanup?.() },
          }),
        ])
      }
      catch (error) {
        failure = { error: failure
          ? new AggregateError([failure.error, error], 'issue #1210 Web 验证与收尾均失败。', { cause: failure.error })
          : error }
      }
    }
    if (failure) {
      throw failure.error
    }
  }, 360_000)
})
