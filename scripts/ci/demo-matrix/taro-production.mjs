import assert from 'node:assert/strict'
import { readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { chromium } from 'playwright'
import { insideProductionRoot, productionRequestFile } from './production-path.mjs'
import { assertTaroProductionEvidence } from './taro-production-contract.mjs'

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' }

/** 直接消费真实生产 HTML 与加载图；这里只提供浏览器产物证据，不代表 Harmony 设备。 */
export async function inspectTaroProduction(item, directory, artifactDir) {
  const root = await realpath(directory)
  const requested = []
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://fixture.local')
      let file = productionRequestFile(root, url.pathname)
      if ((await stat(file)).isDirectory()) {
        file = path.join(file, 'index.html')
      }
      file = await realpath(file)
      assert.ok(insideProductionRoot(root, file), '生产请求不能通过链接离开归属目录')
      const body = await readFile(file)
      requested.push(path.relative(root, file))
      response.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream' })
      response.end(body)
    }
    catch {
      response.writeHead(404)
      response.end('missing fixture asset')
    }
  })
  let browser
  let page
  let evidence
  let failure
  const events = []
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const url = `http://127.0.0.1:${server.address().port}/`
    browser = await chromium.launch({ headless: true })
    page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
    page.on('pageerror', error => events.push(String(error)))
    page.on('console', (message) => {
      if (message.type() === 'error') {
        events.push(message.text())
      }
    })
    page.on('requestfailed', request => events.push(`${request.url()}: ${request.failure()?.errorText}`))
    page.on('response', (response) => {
      if (response.status() >= 400) {
        events.push(`${response.status()}: ${response.url()}`)
      }
    })
    const response = await page.goto(url, { waitUntil: 'load', timeout: 15_000 })
    assert.ok(response?.ok(), `${item.id}: production document`)
    await page.locator('#tw-matrix-height').waitFor({ timeout: 10_000 })
    await page.evaluate(async () => {
      let timer
      try {
        // 节点可见早于 Stencil 样式就绪；等待真实组件定义与首次渲染，不用固定延迟。
        await Promise.race([
          Promise.all([...document.querySelectorAll('[id^="tw-matrix-"]')].map(async (element) => {
            if (element.localName.includes('-')) {
              await customElements.whenDefined(element.localName)
              await element.componentOnReady?.()
            }
          })),
          new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('生产组件未完成初始化')), 10_000) }),
        ])
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      }
      finally { clearTimeout(timer) }
    })
    evidence = await page.evaluate(() => {
      const read = (key) => {
        const element = document.getElementById(`tw-matrix-${key}`)
        if (!element?.textContent.includes(`tw-matrix-initial-${key}`)) {
          throw new Error(`生产页缺少本轮探针：${key}`)
        }
        const css = getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || rect.width <= 0 || rect.height <= 0) {
          throw new Error(`生产探针不可见：${key}`)
        }
        return { height: css.height === 'auto' ? null : Number.parseFloat(css.height), margin: Number.parseFloat(css.marginTop), color: css.color, background: css.backgroundColor, width: rect.width, boxHeight: rect.height, visible: true }
      }
      const context = document.createElement('canvas').getContext('2d')
      const raster = (value) => {
        context.clearRect(0, 0, 1, 1)
        context.fillStyle = value
        context.fillRect(0, 0, 1, 1)
        return [...context.getImageData(0, 0, 1, 1).data]
      }
      const computed = Object.fromEntries(['height', 'medium', 'large', 'margin', 'color', 'opacity'].map(key => [key, read(key)]))
      return {
        rootFontSize: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
        computed,
        pixels: { color: raster(computed.color.color), opacity: raster(computed.opacity.background) },
        reference: { color: raster('#62748e'), opacity: raster('rgba(236,253,245,0.8)') },
        stylesheets: [...document.styleSheets].map(sheet => sheet.href),
      }
    })
    assertTaroProductionEvidence(item, evidence)
    assert.deepEqual(events, [], `${item.id}: production loading errors`)
    await page.screenshot({ path: path.join(artifactDir, 'production-browser.png') })
    return evidence
  }
  catch (error) {
    failure = String(error)
    if (page && !page.isClosed()) {
      try {
        await page.screenshot({ path: path.join(artifactDir, 'production-browser-failure.png') })
        await writeFile(path.join(artifactDir, 'production-browser-failure.html'), await page.content())
      }
      catch (captureError) {
        throw new AggregateError([error, captureError], `${item.id}: 生产断言与失败截图均失败`)
      }
    }
    throw error
  }
  finally {
    try {
      await writeFile(path.join(artifactDir, 'production-browser.json'), JSON.stringify({ id: item.id, root, requested, evidence, events, failure, limitation: '普通浏览器中的生产产物，不是 Harmony 设备证据' }, null, 2))
    }
    finally {
      try {
        await browser?.close()
      }
      finally {
        server.closeAllConnections()
        if (server.listening) {
          await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
        }
      }
    }
  }
}
