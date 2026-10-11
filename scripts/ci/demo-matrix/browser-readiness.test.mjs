import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { expect, it, vi } from 'vitest'
import { openBrowser } from './browser.mjs'

it.each([200, 404])('最后一次异步就绪检查期间切换到 HTTP %i 文档时不能返回旧文档结果', async (status) => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'demo-matrix-readiness-')))
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{
      name: 'document-readiness-boundary',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (!['/', '/replacement'].includes(req.url)) {
            return next()
          }
          res.statusCode = req.url === '/replacement' ? status : 200
          res.setHeader('Content-Type', 'text/html')
          res.end(req.url === '/replacement'
            ? '<div id="tw-matrix-height">replacement</div>'
            : '<script type="module" src="/@vite/client"></script><div id="tw-matrix-height">ready</div>')
        })
      },
    }],
  })
  const launch = chromium.launch.bind(chromium)
  let switched = false
  let replacementStatus
  // 在真实 CDP 结果返回前切换文档，确定性覆盖最后一次 await 的观察空窗。
  const intercepted = vi.spyOn(chromium, 'launch').mockImplementation(async (...args) => {
    const browser = await launch(...args)
    const newPage = browser.newPage.bind(browser)
    browser.newPage = async (...args) => {
      const page = await newPage(...args)
      const evaluate = page.evaluate.bind(page)
      page.evaluate = async (...args) => {
        const result = await evaluate(...args)
        if (!switched) {
          switched = true
          const response = await page.goto(new URL('/replacement', page.url()).href, { waitUntil: 'load' })
          replacementStatus = response.status()
        }
        return result
      }
      return page
    }
    return browser
  })
  let browser
  try {
    await server.listen()
    const opened = openBrowser(server.resolvedUrls.local[0], {
      ensureRunning() {
        if (switched) {
          throw new Error('新文档必须重新完成就绪检查')
        }
      },
    }, root).then((opened) => {
      browser = opened
      return '错误放行旧文档'
    })
    await expect(opened).rejects.toThrow('新文档必须重新完成就绪检查')
    expect(switched).toBe(true)
    expect(replacementStatus).toBe(status)
  }
  finally {
    intercepted.mockRestore()
    await browser?.close()
    await server.close()
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)
