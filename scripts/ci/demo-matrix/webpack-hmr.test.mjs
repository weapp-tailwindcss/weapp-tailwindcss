import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import webpack from 'webpack'

it('Webpack only 客户端在检查更新后遇到异步 chunk 时仍完成应用', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'webpack-hot-apply-'))
  const output = path.join(root, 'dist')
  const value = path.join(root, 'value.cjs')
  let compiler
  let watcher
  let browser
  let server
  try {
    await writeFile(value, 'module.exports = 1')
    await writeFile(path.join(root, 'late.cjs'), 'module.exports = "late"')
    await writeFile(path.join(root, 'entry.cjs'), `
      const render = () => { globalThis.matrixValue = require('./value.cjs') }
      render()
      module.hot.accept('./value.cjs', render)
      let loading = false
      module.hot.addStatusHandler(status => {
        if (status === 'ready' && !loading) {
          loading = true
          import('./late.cjs')
        }
      })
      globalThis.matrixStatus = () => module.hot.status()
      globalThis.matrixUpdate = hash => require(${JSON.stringify(fileURLToPath(import.meta.resolve('webpack/hot/emitter.js')))}).emit('webpackHotUpdate', hash)
    `)
    compiler = webpack({
      mode: 'development',
      context: root,
      entry: [fileURLToPath(import.meta.resolve('webpack/hot/only-dev-server.js')), './entry.cjs'],
      output: { path: output, filename: 'main.js', publicPath: '/' },
      plugins: [new webpack.HotModuleReplacementPlugin()],
    })
    let buildFinished
    const build = () => new Promise((resolve, reject) => {
      buildFinished = { resolve, reject }
    })
    const initialBuild = build()
    watcher = compiler.watch({ aggregateTimeout: 10 }, (error, stats) => {
      if (error || stats.hasErrors()) {
        buildFinished.reject(error ?? new Error(stats.toString()))
      }
      else { buildFinished.resolve(stats.hash) }
    })
    const initialHash = await initialBuild
    server = createServer(async (req, res) => {
      try {
        if (req.url === '/') {
          res.setHeader('content-type', 'text/html')
          res.end('<script src="/main.js"></script>')
        }
        else {
          res.setHeader('content-type', req.url.endsWith('.json') ? 'application/json' : 'text/javascript')
          res.end(await readFile(path.join(output, path.basename(new URL(req.url, 'http://localhost').pathname))))
        }
      }
      catch { res.writeHead(404).end() }
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    const events = []
    page.on('console', message => events.push(message.text()))
    page.on('pageerror', error => events.push(error.message))
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    const nextBuild = build()
    await writeFile(value, 'module.exports = 2')
    const hash = await nextBuild
    expect(hash).not.toBe(initialHash)
    await page.evaluate(hash => globalThis.matrixUpdate(hash), hash)
    try {
      await expect.poll(() => page.evaluate(() => ({ value: globalThis.matrixValue, status: globalThis.matrixStatus() })), { timeout: 3000 }).toEqual({ value: 2, status: 'idle' })
    }
    catch (error) { throw new Error(events.join('\n'), { cause: error }) }
  }
  finally {
    await browser?.close()
    if (server) {
      server.closeAllConnections()
      await new Promise(resolve => server.close(resolve))
    }
    if (watcher) {
      await new Promise(resolve => watcher.close(resolve))
    }
    if (compiler) {
      await new Promise(resolve => compiler.close(resolve))
    }
    await rm(root, { recursive: true, force: true })
  }
}, 15_000)
