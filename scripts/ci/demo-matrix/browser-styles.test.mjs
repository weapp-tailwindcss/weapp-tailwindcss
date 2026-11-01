import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'
import { expect, it, onTestFailed } from 'vitest'
import { authoredCss } from './authored.mjs'
import { openBrowser } from './browser.mjs'
import { cases } from './catalog.mjs'
import { probeClasses } from './probe.mjs'
import { until } from './process.mjs'

const item = cases.find(item => item.id === 'style-injector-uni-app:h5')
function markup(round) {
  return Object.entries(probeClasses(item, round)).map(([key, name]) =>
    `<div id="tw-matrix-${key}" class="${name}" data-tw-matrix="${round}">tw-matrix-${round}-${key}</div>`,
  ).join('\n')
}

async function cleanup(root, browser, server, foreign, track = (name, operation) => operation()) {
  // 独立收回自有资源；任意关闭失败都不能阻止其余资源清理。
  const results = await Promise.allSettled([
    track('browser close', () => browser?.close(), Boolean(browser)),
    track('Vite close', () => server?.close(), Boolean(server)),
    foreign && track('foreign server close', () => new Promise((resolve, reject) => foreign.close(error => error ? reject(error) : resolve()))),
  ])
  results.push(...await Promise.allSettled([track('fixture removal', () => rm(root, { recursive: true, force: true }))]))
  const errors = results.filter(result => result.status === 'rejected').map(result => result.reason)
  if (errors.length) {
    throw new AggregateError(errors, '浏览器样式回归资源清理失败')
  }
}

it('按 CSS 表示读取真实 Vite 当前外链样式，并验证连续替换与刷新', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'demo-matrix-styles-')))
  let browser
  let server
  try {
    let round = 'initial'
    // 此回归验证采集边界；预写独立 URL，避免耦合原生 watcher 的同路径事件节流。
    for (const value of ['initial', 'replace', 'add', 'restore']) {
      await writeFile(path.join(root, `${value}.css`), authoredCss(item, value))
    }
    await writeFile(path.join(root, 'entry.js'), `
      import.meta.hot.on('fixture-round', async ({ html, href }) => {
        const previous = document.querySelector('link[rel="stylesheet"]')
        const current = document.createElement('link')
        current.rel = 'stylesheet'
        current.href = href
        await new Promise((resolve, reject) => {
          current.onload = resolve
          current.onerror = () => {
            current.remove()
            reject(new Error('当前轮次样式加载失败: ' + href))
          }
          document.head.append(current)
        })
        previous.remove()
        document.body.innerHTML = html
      })
    `)
    server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
      plugins: [{
        name: 'external-stylesheet-page',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url !== '/') {
              return next()
            }
            res.setHeader('Content-Type', 'text/html')
            res.end(`<link rel="stylesheet" href="/${round}.css">
              <script type="module" src="/@vite/client"></script>
              <script type="module" src="/entry.js"></script><body>${markup(round)}</body>`)
          })
        },
      }],
    })
    await server.listen()
    const url = server.resolvedUrls.local[0]
    const stylesheet = new URL('initial.css', url)
    // 同一个真实 Vite URL 按 Accept 返回不同表示，不能把 JS proxy 交给 CSS parser。
    const moduleResponse = await fetch(stylesheet)
    expect(moduleResponse.headers.get('content-type')).toContain('javascript')
    expect(await moduleResponse.text()).toContain('createHotContext')
    const cssResponse = await fetch(stylesheet, { headers: { Accept: 'text/css' } })
    expect(cssResponse.headers.get('content-type')).toContain('text/css')
    expect(await cssResponse.text()).toContain('#123456')

    browser = await openBrowser(url, undefined, root, { startupTimeout: 20_000 })
    for (round of ['initial', 'replace', 'add', 'restore']) {
      if (round !== 'initial') {
        await browser.waitForUpdateIdle()
        server.ws.send({ type: 'custom', event: 'fixture-round', data: { html: markup(round), href: `/${round}.css` } })
      }
      const inspectRound = async () => {
        const result = await browser.inspect(item, round)
        if (round === 'add') {
          expect(Number.parseFloat(result.computed.added.width) / 9).toBeCloseTo(Number.parseFloat(result.computed.height.height) / 12)
        }
        return result
      }
      const result = round === 'initial'
        ? await inspectRound()
        : await until(inspectRound, undefined, 10_000)
      // 原始字节保留 authored 色值，CSSOM 序列化会把它变成 rgb()。
      expect(result.rules['tw-authored-color']).toEqual(['#123456'])
      expect(result.computed.color.color).toBe('rgb(18, 52, 86)')
      expect(result.rules[probeClasses(item, round).height]).toEqual([round === 'replace' || round === 'add' ? '12rem' : '8rem'])
    }
    round = 'restore'
    await browser.reload()
    await until(() => browser.inspect(item, round), undefined, 10_000)
    await browser.close()
    browser = undefined
    const inspection = JSON.parse(await readFile(path.join(root, 'last-inspection.json'), 'utf8'))
    expect(inspection.styleSources).toEqual([new URL('restore.css', url).href])
  }
  finally {
    await cleanup(root, browser, server)
  }
}, 30_000)

it.each([
  { status: 503, type: 'text/css', body: '', error: /503/ },
  { status: 200, type: 'text/javascript', body: '', error: /text\/javascript/ },
  { status: 200, type: 'text/css', body: '.broken {', error: /Unclosed block/ },
  { status: 200, type: 'text/css', body: '/* pending', hanging: true, error: /timed out|aborted|exceeded 5000ms/ },
])('本地外链采集失败不能由其他有效样式掩盖：$status / $type / $hanging', async ({ status, type, body, hanging, error }) => {
  const stages = []
  // 超时钩子在异步 finally 完成前也可输出当前阶段，保留原始错误与全部预算。
  onTestFailed(() => console.error(`Browser stylesheet stages: ${JSON.stringify(stages)}`))
  const track = async (name, operation, acquired = true) => {
    const stage = { name, status: acquired ? 'running' : 'not-acquired' }
    stages.push(stage)
    if (!acquired) {
      return
    }
    try {
      const result = await operation()
      stage.status = 'completed'
      return result
    }
    catch (error) {
      stage.status = 'failed'
      throw error
    }
  }
  const root = await track('fixture allocation', async () => realpath(await mkdtemp(path.join(tmpdir(), 'demo-matrix-style-errors-'))))
  let failing = false
  let pendingResponse
  let browser
  let server
  try {
    server = await track('Vite creation', () => createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
      plugins: [{
        name: 'invalid-local-stylesheet',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url === '/local.css') {
              res.statusCode = failing ? status : 200
              res.setHeader('Content-Type', failing ? type : 'text/css')
              if (failing && hanging) {
                pendingResponse = res
                res.write(body)
              }
              else { res.end(failing ? body : '') }
            }
            else if (req.url === '/') {
              res.setHeader('Content-Type', 'text/html')
              res.end(`<link rel="stylesheet" href="/local.css">
                <style>${authoredCss(item, 'initial')}</style>
                <script type="module" src="/@vite/client"></script><body>${markup('initial')}</body>`)
            }
            else { next() }
          })
        },
      }],
    }))
    await track('Vite listen', () => server.listen())
    browser = await track('browser startup', () => openBrowser(server.resolvedUrls.local[0], undefined, root, { startupTimeout: 20_000 }))
    await track('initial inspection', () => browser.inspect(item, 'initial'))
    failing = true
    await track('expected inspection rejection', () => expect(browser.inspect(item, 'initial')).rejects.toThrow(error))
  }
  finally {
    pendingResponse?.end()
    await cleanup(root, browser, server, undefined, track)
  }
}, 30_000)

it('明确外源的第三方链接不参与本地样式采集', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'demo-matrix-foreign-style-')))
  const requests = []
  const foreign = createHttpServer((req, res) => {
    requests.push(req.headers['sec-fetch-dest'])
    res.setHeader('Content-Type', 'text/css')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.end('body { font-family: sans-serif }')
  })
  let server
  let browser
  try {
    await new Promise(resolve => foreign.listen(0, '127.0.0.1', resolve))
    const href = new URL('/third-party.css', `http://127.0.0.1:${foreign.address().port}`).href
    server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
      plugins: [{
        name: 'foreign-stylesheet-page',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url !== '/') {
              return next()
            }
            res.setHeader('Content-Type', 'text/html')
            res.end(`<link rel="stylesheet" href="${href}"><style>${authoredCss(item, 'initial')}</style>
              <script type="module" src="/@vite/client"></script><body>${markup('initial')}</body>`)
          })
        },
      }],
    })
    await server.listen()
    browser = await openBrowser(server.resolvedUrls.local[0], undefined, root, { startupTimeout: 20_000 })
    await browser.inspect(item, 'initial')
    expect(requests).toEqual(['style'])
  }
  finally {
    await cleanup(root, browser, server, foreign)
  }
}, 30_000)
