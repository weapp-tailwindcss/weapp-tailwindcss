import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { coverage, isWeb } from './catalog.mjs'
import { inspectStyles } from './output.mjs'
import { probeClasses } from './probe.mjs'
import { until } from './process.mjs'

export async function openBrowser(url, session, artifactDir) {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  const events = []
  const pendingModules = new Set()
  const origin = new URL(url).origin
  let documentResponse
  let transportReady = false
  let documentVersion = 0
  let transientModuleFailure
  let startupReloads = 0
  let lastInspection
  const assertUpdateIdle = async () => {
    const status = await page.evaluate(() => globalThis.__WEAPP_TW_MATRIX_HMR_STATUS__?.())
    assert.ok(status === undefined || status === 'idle', `Development update is still applying: ${status}`)
    assert.equal(pendingModules.size, 0, 'Local update modules are still loading')
  }
  page.on('response', (response) => {
    const request = response.request()
    // hash/history 路由仍使用原文档和连接，只有新主文档响应重置状态。
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      documentResponse = response
    }
    if (request.isNavigationRequest() && request.frame() === page.mainFrame() && response.status() >= 200 && response.status() < 300) {
      documentVersion++
      pendingModules.clear()
      transportReady = false
      transientModuleFailure = undefined
    }
  })
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      documentResponse = undefined
    }
    if (new URL(request.url()).origin === origin && ['script', 'stylesheet'].includes(request.resourceType())) {
      pendingModules.add(request)
    }
  })
  page.on('requestfinished', request => pendingModules.delete(request))
  page.on('requestfailed', (request) => {
    if (pendingModules.has(request) && /ERR_NO_BUFFER_SPACE|ERR_EMPTY_RESPONSE/.test(request.failure()?.errorText ?? '')) {
      transientModuleFailure = `${request.url()}: ${request.failure()?.errorText}`
    }
    pendingModules.delete(request)
  })
  page.on('websocket', (socket) => {
    const socketDocumentVersion = documentVersion
    socket.on('framereceived', ({ payload }) => {
      if (socketDocumentVersion !== documentVersion) {
        return
      }
      try {
        const message = JSON.parse(String(payload))
        if (['connected', 'ok', 'still-ok', 'warnings'].includes(message.type)) {
          transportReady = true
        }
      }
      catch { /* 应用自己的 WebSocket 消息不参与构建工具握手。 */ }
    })
  })
  page.on('pageerror', error => events.push(error.stack))
  page.on('requestfailed', request => events.push(`${request.url()}: ${request.failure()?.errorText}`))
  page.on('console', (message) => {
    events.push(`${message.type()}: ${message.text()}`)
  })
  try {
    await until(async () => {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
      await response.arrayBuffer()
      assert.ok(response.ok, url)
    }, session)
    await until(async () => {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 })
      // 开发重载可能中断首次 goto；随后同一 hash 导航没有新的 HTTP 响应。
      const targetDocument = new URL(url)
      targetDocument.hash = ''
      const currentDocument = response === null && page.url() === url && documentResponse?.url() === targetDocument.href
        ? documentResponse
        : response
      assert.ok(currentDocument?.ok(), url)
    }, session)
    await until(async () => {
      if (transientModuleFailure) {
        assert.equal(startupReloads, 0, `Module transport failed again after startup recovery: ${transientModuleFailure}`)
        events.push(`startup-reload: ${transientModuleFailure}`)
        startupReloads++
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 15_000 })
      }
      const version = documentVersion
      await page.locator('#tw-matrix-height').waitFor({ timeout: 5000 })
      // requestfinished 只证明响应已下载，async 脚本可能尚未执行；load 不等待后台 fetch。
      await page.waitForLoadState('load', { timeout: 5000 })
      assert.equal(documentVersion, version, 'Document changed while waiting for local scripts')
      assert.equal(pendingModules.size, 0, `Local modules still loading: ${[...pendingModules].map(request => request.url()).join(', ')}`)
      assert.ok(documentResponse?.ok(), 'Current document navigation is not complete')
      assert.ok(transportReady, 'Development update transport is not ready')
      await assertUpdateIdle()
    }, session)
    return {
      events,
      async waitForUpdateIdle() { await until(assertUpdateIdle, session) },
      async inspect(item, round) {
        const result = await page.evaluate(async ({ expected, round }) => {
          const styles = []
          for (const sheet of document.styleSheets) {
            try {
              styles.push(sheet.ownerNode?.nodeName === 'STYLE' ? sheet.ownerNode.textContent : sheet.href ? await (await fetch(sheet.href)).text() : [...sheet.cssRules].map(rule => rule.cssText).join('\n'))
            }
            catch { /* 跨域第三方样式不能承载本地探针。 */ }
          }
          const computed = {}
          for (const [key, className] of Object.entries(expected)) {
            const element = document.getElementById(`tw-matrix-${key}`)
            if (!element || element.getAttribute('data-tw-matrix') !== round || !element.textContent.includes(`tw-matrix-${round}-${key}`)) {
              throw new Error(`Stale or missing probe ${key} / ${round}`)
            }
            const css = getComputedStyle(element)
            computed[key] = { className: element.className, expected: className, height: css.height, width: css.width, marginTop: css.marginTop, display: css.display, color: css.color, backgroundColor: css.backgroundColor }
          }
          if (round === 'restore' && document.getElementById('tw-matrix-added')) {
            throw new Error('Deleted probe remains rendered')
          }
          return { styles, computed, rootFontSize: Number.parseFloat(getComputedStyle(document.documentElement).fontSize) }
        }, { expected: probeClasses(item, round), round })
        lastInspection = { round, ...result }
        const consumed = Object.fromEntries(Object.values(result.computed).map(actual => [actual.expected, actual.className.split(/\s+/)]))
        const output = inspectStyles(result.styles, item, round, consumed)
        if (coverage(item) === 'authored-styles') {
          assert.equal(result.computed.display.display, 'flex')
          assert.equal(result.computed.color.color, 'rgb(18, 52, 86)')
          if (isWeb(item)) {
            const multiple = round === 'replace' || round === 'add' ? 12 : 8
            assert.ok(Math.abs(Number.parseFloat(result.computed.height.height) - multiple * result.rootFontSize) < 0.1)
          }
        }
        else if (isWeb(item)) {
          const heights = ['height', 'medium', 'large'].map(key => Number.parseFloat(result.computed[key].height))
          assert.ok(heights.every(value => value > 0))
          const multiple = round === 'replace' || round === 'add' ? 12 : 8
          assert.ok(Math.abs(heights[0] / multiple - heights[1] / 20) < 0.1, `${item.id}: ${round} rendered heights ${heights}`)
          assert.ok(Math.abs(heights[1] / 20 - heights[2] / 50) < 0.1)
          assert.equal(result.computed.display.display, 'flex')
          const unit = item.family === 'taro' ? result.rootFontSize : 1
          const small = item.family === 'taro' ? 4 : 64
          const large = item.family === 'taro' ? 25 : 400
          assert.ok(Math.abs(Number.parseFloat(result.computed.arbitrary.height) - small * unit) < 0.1)
          assert.ok(Math.abs(Number.parseFloat(result.computed.arbitraryLarge.height) - large * unit) < 0.1)
          if (round === 'add') {
            assert.ok(Math.abs(Number.parseFloat(result.computed.added.width) - (item.family === 'taro' ? 9 * unit : 137)) < 0.1)
          }
        }
        return { ...output, computed: result.computed }
      },
      async screenshot(round) { await page.screenshot({ path: path.join(artifactDir, `${round}.png`), fullPage: false }) },
      async reload() { await page.reload({ waitUntil: 'domcontentloaded' }) },
      async close() {
        await writeFile(path.join(artifactDir, 'last-inspection.json'), JSON.stringify(lastInspection ?? {}, null, 2))
        await browser.close()
      },
    }
  }
  catch (error) {
    await writeFile(path.join(artifactDir, 'browser-errors.json'), JSON.stringify(events, null, 2))
    await writeFile(path.join(artifactDir, 'browser-failure.html'), await page.content()).catch(() => {})
    await page.screenshot({ path: path.join(artifactDir, 'browser-failure.png') }).catch(() => {})
    await browser.close()
    throw error
  }
}
