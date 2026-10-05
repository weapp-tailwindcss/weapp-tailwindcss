import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'
import { expect, it } from 'vitest'
import { openBrowser } from './browser.mjs'

it('等待已有 DOM 的 HMR 应用完成后才允许开始下一轮', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'demo-matrix-hmr-idle-')))
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{
      name: 'pending-runtime-update',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url !== '/') {
            return next()
          }
          res.setHeader('Content-Type', 'text/html')
          res.end(`<script type="module" src="/@vite/client"></script>
            <script>
              let status = 'prepare'
              globalThis.__WEAPP_TW_MATRIX_HMR_STATUS__ = () => status
              setTimeout(() => { status = 'idle'; console.log('matrix-hot-idle') }, 1000)
            </script><div id="tw-matrix-height">ready</div>`)
        })
      },
    }],
  })
  let browser
  try {
    await server.listen()
    browser = await openBrowser(server.resolvedUrls.local[0], undefined, root)
    expect(browser.events).toContain('log: matrix-hot-idle')
    await browser.waitForUpdateIdle()
  }
  finally {
    await browser?.close()
    await server.close()
    await rm(root, { recursive: true, force: true })
  }
}, 30000)

it('preserves the development transport across hash and history route changes', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'demo-matrix-routes-')))
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{
      name: 'client-routed-page',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url !== '/') {
            return next()
          }
          res.setHeader('Content-Type', 'text/html')
          res.end(`<script type="module" src="/@vite/client"></script><script type="module">
            const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
            await wait(500)
            location.hash = '/home'
            await wait(100)
            history.replaceState({}, '', '/home#/profile')
            document.body.innerHTML = '<div id="tw-matrix-height">ready</div>'
          </script><body></body>`)
        })
      },
    }],
  })
  let browser
  // Windows CI 的浏览器冷启动也计入预算，路由状态丢失仍必须有界失败。
  const deadline = Date.now() + 20_000
  try {
    await server.listen()
    browser = await openBrowser(server.resolvedUrls.local[0], {
      ensureRunning() { expect(Date.now()).toBeLessThan(deadline) },
    }, root)
    expect(browser.events).toContain('debug: [vite] connected.')
  }
  finally {
    await browser?.close()
    await server.close()
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)

it('does not restart a page whose initialization exceeds the probe polling interval', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'demo-matrix-browser-')))
  let navigations = 0
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{
      name: 'delayed-page',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url !== '/') {
            return next()
          }
          if (req.headers['sec-fetch-dest'] === 'document') {
            navigations++
          }
          res.setHeader('Content-Type', 'text/html')
          res.end('<script type="module" src="/@vite/client"></script><script>setTimeout(() => { document.body.innerHTML = \'<div id="tw-matrix-height">ready</div>\' }, 6000)</script><body></body>')
        })
      },
    }],
  })
  let browser
  try {
    await server.listen()
    browser = await openBrowser(server.resolvedUrls.local[0], undefined, root)
    expect(navigations).toBe(1)
  }
  finally {
    await browser?.close()
    await server.close()
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)

it('waits for local scripts while allowing a persistent background request', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'demo-matrix-readiness-')))
  let background
  let backgroundStarted = false
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{
      name: 'persistent-request-page',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/background') {
            background = res
            backgroundStarted = true
            res.writeHead(200, { 'Content-Type': 'text/plain' })
            res.write('pending')
          }
          else if (req.url === '/delayed.js') {
            res.setHeader('Content-Type', 'text/javascript')
            setTimeout(() => res.end('console.log("local-script-ready")'), 1000)
          }
          else if (req.url === '/') {
            res.setHeader('Content-Type', 'text/html')
            res.end('<script type="module" src="/@vite/client"></script><script>fetch("/background")</script><script async src="/delayed.js"></script><div id="tw-matrix-height">ready</div>')
          }
          else { next() }
        })
      },
    }],
  })
  let browser
  try {
    await server.listen()
    browser = await openBrowser(server.resolvedUrls.local[0], undefined, root)
    expect(backgroundStarted).toBe(true)
    expect(background.writableEnded).toBe(false)
    expect(browser.events).toContain('log: local-script-ready')
  }
  finally {
    background?.end()
    await browser?.close()
    await server.close()
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)

it.each(['', '#/current'])('waits for the current document when reload interrupts DOMContentLoaded (%s)', async (hash) => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'demo-matrix-reload-')))
  let navigations = 0
  let obsolete
  let reloadBarrier
  const releaseReload = () => {
    if (obsolete && reloadBarrier) {
      reloadBarrier.end('ready')
    }
  }
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{
      name: 'reloading-page',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/obsolete.js') {
            obsolete = res
            releaseReload()
          }
          else if (req.url === '/reload-barrier') {
            reloadBarrier = res
            releaseReload()
          }
          else if (req.url === '/current.js') {
            res.setHeader('Content-Type', 'text/javascript')
            setTimeout(() => res.end('console.log("current-document-ready")'), 1000)
          }
          else if (req.url === '/') {
            if (req.headers['sec-fetch-dest'] === 'document') {
              navigations++
            }
            res.setHeader('Content-Type', 'text/html')
            res.end(navigations === 1
              ? '<script type="module" src="/@vite/client"></script><script type="module" src="/obsolete.js"></script><script>fetch("/reload-barrier").then(() => location.reload())</script><div id="tw-matrix-height">previous</div>'
              : '<script type="module" src="/@vite/client"></script><script async src="/current.js"></script><div id="tw-matrix-height">current</div>')
          }
          else { next() }
        })
      },
    }],
  })
  let browser
  try {
    await server.listen()
    browser = await openBrowser(`${server.resolvedUrls.local[0]}${hash}`, undefined, root)
    expect(navigations, JSON.stringify(browser.events)).toBe(2)
    expect(browser.events).toContain('log: current-document-ready')
    expect(browser.events.some(event => event.startsWith('startup-reload:'))).toBe(false)
  }
  finally {
    obsolete?.end()
    reloadBarrier?.end()
    await browser?.close()
    await server.close()
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)

it('records one startup recovery when a local module connection ends without a response', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'demo-matrix-transport-')))
  let navigations = 0
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{
      name: 'dropped-module-response',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/entry.js') {
            if (navigations === 1) {
              res.destroy()
            }
            else {
              res.setHeader('Content-Type', 'text/javascript')
              res.end('document.body.innerHTML = \'<div id="tw-matrix-height">ready</div>\'')
            }
          }
          else if (req.url === '/') {
            if (req.headers['sec-fetch-dest'] === 'document') {
              navigations++
            }
            res.setHeader('Content-Type', 'text/html')
            res.end('<script type="module" src="/@vite/client"></script><script type="module" src="/entry.js"></script><body></body>')
          }
          else { next() }
        })
      },
    }],
  })
  let browser
  try {
    await server.listen()
    browser = await openBrowser(server.resolvedUrls.local[0], undefined, root)
    expect(navigations).toBe(2)
    expect(browser.events.filter(event => event.startsWith('startup-reload:'))).toHaveLength(1)
  }
  finally {
    await browser?.close()
    await server.close()
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)
