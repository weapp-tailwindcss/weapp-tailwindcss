import type { Page } from '@playwright/test'
import type { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { expect, test } from '@playwright/test'
import { navigateWebsite } from './helpers/navigation'

function requestListeners(page: Page) {
  return (page as unknown as EventEmitter).listenerCount('request')
}

async function createFailureFixture() {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let businessStarted!: () => void
  const started = new Promise<void>((resolve) => {
    businessStarted = resolve
  })
  const server = createServer((request, response) => {
    if (request.url === '/blocked') {
      businessStarted()
      void gate.then(() => response.end('released'))
      return
    }
    if (request.url === '/after-fetch.js') {
      void started.then(() => {
        response.writeHead(200, { 'Content-Type': 'application/javascript' })
        response.end('void 0;')
      })
      return
    }
    response.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end(`<!doctype html><html data-has-hydrated="true"><body>
      <script>fetch('/blocked')</script><script src="/after-fetch.js"></script>
      <p>HTTP error with a pending business request</p></body></html>`)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('HTTP fixture 未获得 TCP 端口')
  }
  return {
    url: `http://127.0.0.1:${address.port}/`,
    async dispose() {
      release()
      businessStarted()
      await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve())
        server.closeAllConnections()
      })
    },
  }
}

test('preserves the first HTTP error and attaches actual pending resources and runtime', async ({ page }, testInfo) => {
  const fixture = await createFailureFixture()
  const listeners = requestListeners(page)
  const attachmentCount = testInfo.attachments.length
  try {
    await expect(navigateWebsite(page, fixture.url)).rejects.toThrow(`网站导航失败：HTTP 500 ${fixture.url}`)
    expect(requestListeners(page)).toBe(listeners)
    const attachment = testInfo.attachments.slice(attachmentCount)
      .find(item => item.name === 'website-navigation-state.json')
    expect(attachment, '首失败必须保留诊断附件').toBeDefined()
    expect(attachment!.contentType).toBe('application/json')
    const bytes = attachment!.body ?? await readFile(attachment!.path!)
    const diagnostic = JSON.parse(bytes.toString())
    expect(diagnostic.scope).toBe('navigation-helper-failure')
    expect(diagnostic.error.message).toBe(`网站导航失败：HTTP 500 ${fixture.url}`)
    expect(diagnostic.error.stack).toContain('assertDocumentResponse')
    expect(diagnostic.navigation.generation).toBe(1)
    expect(diagnostic.navigation.response).toMatchObject({ status: 500, url: fixture.url })
    expect(diagnostic.navigation.request).toMatchObject({ url: fixture.url, navigation: true })
    expect(diagnostic.navigation.initialDocumentIdentity).toEqual(expect.any(String))
    expect(diagnostic.pending.requests).toEqual(expect.arrayContaining([
      expect.objectContaining({ url: new URL('/blocked', fixture.url).href, resourceType: 'fetch', navigation: false }),
    ]))
    expect(diagnostic.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'response', response: expect.objectContaining({ status: 500 }) }),
      expect.objectContaining({ type: 'commit', url: fixture.url }),
    ]))
    expect(diagnostic.runtime).toEqual(expect.arrayContaining([
      expect.objectContaining({ document: expect.objectContaining({ url: fixture.url, hydrated: true, fonts: 'loaded' }) }),
    ]))
    expect(diagnostic.pending.requests.find((request: { url: string }) => request.url.endsWith('/blocked')).timing.startTime).toEqual(expect.any(Number))
  }
  finally {
    await fixture.dispose()
  }
})

test('keeps the original closed-page error when a runtime observation cannot complete', async ({ page }, testInfo) => {
  const listeners = requestListeners(page)
  await page.close()
  const attachmentCount = testInfo.attachments.length
  await expect(navigateWebsite(page, 'http://website-diagnostics.test/')).rejects.toThrow(/closed/)
  expect(requestListeners(page)).toBe(listeners)
  const attachment = testInfo.attachments.slice(attachmentCount)
    .find(item => item.name === 'website-navigation-state.json')
  expect(attachment, '诊断失败不能掩盖原异常或丢失附件').toBeDefined()
  const bytes = attachment!.body ?? await readFile(attachment!.path!)
  const diagnostic = JSON.parse(bytes.toString())
  expect(diagnostic.error.message).toMatch(/closed/)
  expect(diagnostic.runtime).toEqual(expect.arrayContaining([
    expect.objectContaining({ error: expect.stringMatching(/closed/) }),
  ]))
})
