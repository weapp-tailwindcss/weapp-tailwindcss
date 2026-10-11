import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'
import { expect, it } from 'vitest'
import { openBrowser } from './browser.mjs'

it('首次主文档连接中断仍可恢复，未把无响应当成页面就绪', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'demo-matrix-document-connection-')))
  let navigations = 0
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{
      name: 'dropped-document-response',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url !== '/') {
            return next()
          }
          if (req.headers['sec-fetch-dest'] === 'document') {
            navigations++
            if (navigations === 1) {
              res.destroy()
              return
            }
          }
          res.setHeader('Content-Type', 'text/html')
          res.end('<script type="module" src="/@vite/client"></script><script>console.log("recovered-document-ready")</script><div id="tw-matrix-height">ready</div>')
        })
      },
    }],
  })
  let browser
  try {
    await server.listen()
    browser = await openBrowser(server.resolvedUrls.local[0], undefined, root)
    expect(navigations).toBe(2)
    expect(browser.events).toContain('log: recovered-document-ready')
    expect(browser.events).toContain('debug: [vite] connected.')
    expect(browser.events.some(event => event.startsWith('startup-reload:'))).toBe(false)
  }
  finally {
    await browser?.close()
    await server.close()
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)
