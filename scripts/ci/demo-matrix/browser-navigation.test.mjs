import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { expect, it, vi } from 'vitest'
import { openBrowser } from './browser.mjs'

it.each([200, 404].flatMap(status => ['', '#/sub-normal/pages/index/index'].map(hash => ({ status, hash }))))('导航响应后中断时按当前 HTTP $status 判断就绪且不重发成功文档 ($hash)', async ({ status, hash }) => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'demo-matrix-hash-recovery-')))
  let navigations = 0
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{
      name: 'hash-document',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url !== '/') {
            return next()
          }
          if (req.headers['sec-fetch-dest'] === 'document') {
            navigations++
          }
          res.statusCode = req.headers['sec-fetch-dest'] === 'document' ? status : 200
          res.setHeader('Content-Type', 'text/html')
          res.end('<script type="module" src="/@vite/client"></script><div id="tw-matrix-height">ready</div>')
        })
      },
    }],
  })
  const launch = chromium.launch.bind(chromium)
  const navigationResponses = []
  // 保留真实 Chromium 导航，只注入 CI 已观察到的首次导航中断。
  const intercepted = vi.spyOn(chromium, 'launch').mockImplementation(async (...args) => {
    const browser = await launch(...args)
    const newPage = browser.newPage.bind(browser)
    browser.newPage = async (...args) => {
      const page = await newPage(...args)
      const goto = page.goto.bind(page)
      let initial = true
      page.goto = async (...args) => {
        const response = await goto(...args)
        navigationResponses.push(response?.status() ?? null)
        if (initial) {
          initial = false
          throw new Error('net::ERR_ABORTED during development reload')
        }
        return response
      }
      return page
    }
    return browser
  })
  let browser
  const deadline = Date.now() + 20_000
  try {
    await server.listen()
    const opened = openBrowser(`${server.resolvedUrls.local[0]}${hash}`, {
      ensureRunning() {
        expect(Date.now()).toBeLessThan(deadline)
        if (navigationResponses.length >= 3) {
          throw new Error('当前文档未通过 HTTP 状态校验')
        }
      },
    }, root)
    if (status !== 200) {
      await expect(opened).rejects.toThrow('当前文档未通过 HTTP 状态校验')
      expect(navigationResponses).toEqual(hash ? [404, null, null] : [404, 404, 404])
      return
    }
    browser = await opened
    expect(navigationResponses).toEqual([200])
    expect(navigations).toBe(1)
    expect(browser.events).toContain('debug: [vite] connected.')
  }
  finally {
    intercepted.mockRestore()
    await browser?.close()
    await server.close()
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)
