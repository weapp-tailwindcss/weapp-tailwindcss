import type { Page, Request, Response } from '@playwright/test'
import type { EventEmitter } from 'node:events'
import { expect, test } from '@playwright/test'
import { createDocumentFixture } from './helpers/document-fixture'
import { navigateWebsite } from './helpers/navigation'

function listenerCounts(page: Page) {
  const emitter = page as unknown as EventEmitter
  return ['request', 'response', 'requestfinished', 'requestfailed', 'framenavigated']
    .map(event => emitter.listenerCount(event))
}

// Firefox 的合并后 2xx 性能记录独立证明正文；此组检验缺少该记录的真实 WebKit 缓存分支。
test.describe('website cached representation evidence', () => {
  test.skip(({ browserName }) => browserName !== 'webkit', '仅 WebKit 缺少重验证后的合并状态与正文性能记录')

  test('discards old metadata failure when a new document starts during cache evidence collection', async ({ page }) => {
    const fixture = await createDocumentFixture({ revalidationEtag: '"other-v2"' })
    let replaced = false
    const onResponse = (response: Response) => {
      if (response.url() !== fixture.url('/cached') || response.status() !== 304) {
        return
      }
      const original = response.allHeaders.bind(response)
      response.allHeaders = async () => {
        if (!replaced) {
          replaced = true
          const committed = page.waitForURL(fixture.url('/replacement'), { waitUntil: 'load' })
          await page.evaluate(() => location.replace('/replacement'))
          await committed
        }
        return original()
      }
    }
    page.on('response', onResponse)
    const before = listenerCounts(page)
    try {
      await navigateWebsite(page, fixture.url('/cached'))
      await navigateWebsite(page, fixture.url('/ready'))
      const response = await navigateWebsite(page, fixture.url('/cached'))
      expect(replaced).toBe(true)
      expect(response.status()).toBe(200)
      expect(response.url()).toBe(fixture.url('/replacement'))
      await expect(page).toHaveURL(fixture.url('/replacement'))
      await expect(page.locator('output')).toHaveText('ready')
      expect(listenerCounts(page)).toEqual(before)
    }
    finally {
      page.off('response', onResponse)
      await fixture.dispose()
    }
  })

  test('rejects an unfinished intermediate response as a cached representation source', async ({ page }) => {
    const fixture = await createDocumentFixture()
    const failed: string[] = []
    const onFailed = (request: Request) => failed.push(request.url())
    page.on('requestfailed', onFailed)
    const before = listenerCounts(page)
    try {
      await navigateWebsite(page, fixture.url('/unfinished-locale'))
      expect(failed).toContain(fixture.url('/unfinished-locale'))
      await page.evaluate(() => localStorage.setItem('locale', 'en'))
      await page.setExtraHTTPHeaders({ 'If-None-Match': '"ready-v1"' })
      await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.dataset.hasHydrated = 'true'
      }))
      await expect(navigateWebsite(page, fixture.url('/unfinished-locale'))).rejects.toThrow(/HTTP 304/)
      expect(fixture.requests.filter(request => request.path === '/unfinished-locale').at(-1))
        .toMatchObject({ status: 304, validator: '"ready-v1"' })
      expect(listenerCounts(page)).toEqual(before)
    }
    finally {
      page.off('requestfailed', onFailed)
      await fixture.dispose()
    }
  })

  for (const policy of ['no-store', 'vary-star', 'partial-status', 'partial-header']) {
    test(`rejects an uncacheable original representation: ${policy}`, async ({ page }) => {
      const fixture = await createDocumentFixture({
        cacheControl: policy === 'no-store' ? 'no-store' : undefined,
        vary: policy === 'vary-star' ? '*' : undefined,
        partial: policy === 'partial-status',
        contentRange: policy === 'partial-header' ? 'bytes 0-99/200' : undefined,
      })
      const before = listenerCounts(page)
      try {
        await navigateWebsite(page, fixture.url('/cached'))
        await navigateWebsite(page, fixture.url('/ready'))
        await page.setExtraHTTPHeaders({ 'If-None-Match': '"ready-v1"' })
        // 即使空白错误文档伪造 hydration，条件请求也不能补足原表示的存储资格。
        await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
          document.documentElement.dataset.hasHydrated = 'true'
        }))
        await expect(navigateWebsite(page, fixture.url('/cached'))).rejects.toThrow(/HTTP 304/)
        expect(fixture.requests.filter(request => request.path === '/cached').at(-1))
          .toMatchObject({ status: 304, validator: '"ready-v1"' })
        expect(listenerCounts(page)).toEqual(before)
      }
      finally {
        await fixture.dispose()
      }
    })
  }

  test('does not inherit another page HTTP representation from the same browser context', async ({ page }) => {
    const fixture = await createDocumentFixture()
    const other = await page.context().newPage()
    try {
      await navigateWebsite(page, fixture.url('/cached'))
      // 新 Page 的浏览器缓存先由外部导航建立，不能借用另一个 Page 的 helper 来源。
      await other.goto(fixture.url('/cached'), { waitUntil: 'load' })
      await navigateWebsite(other, fixture.url('/ready'))
      await expect(navigateWebsite(other, fixture.url('/cached'))).rejects.toThrow(/HTTP 304/)
      expect(fixture.requests.filter(request => request.path === '/cached').at(-1))
        .toMatchObject({ status: 304, validator: '"ready-v1"' })
    }
    finally {
      try {
        await other.close()
      }
      finally {
        await fixture.dispose()
      }
    }
  })

  test('does not reuse a representation after its Vary request value changes', async ({ page }) => {
    const fixture = await createDocumentFixture({ vary: 'Accept-Language' })
    try {
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'zh-CN' })
      await navigateWebsite(page, fixture.url('/cached'))
      await navigateWebsite(page, fixture.url('/ready'))
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US', 'If-None-Match': '"ready-v1"' })
      await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.dataset.hasHydrated = 'true'
      }))
      await expect(navigateWebsite(page, fixture.url('/cached'))).rejects.toThrow(/HTTP 304/)
    }
    finally {
      await fixture.dispose()
    }
  })

  for (const missing of ['response-validator', 'mismatched-response', 'mismatched-request', 'request-validator', 'verified-origin', 'same-url']) {
    test(`rejects incomplete cached representation provenance: ${missing}`, async ({ page }) => {
      const fixture = await createDocumentFixture({
        revalidationEtag: missing === 'response-validator' ? null : missing === 'mismatched-response' ? '"other-v2"' : undefined,
        forceRevalidation: true,
      })
      const before = listenerCounts(page)
      try {
        if (missing === 'verified-origin') {
          await page.goto(fixture.url('/cached'), { waitUntil: 'load' })
        }
        else {
          await navigateWebsite(page, fixture.url('/cached'))
        }
        await navigateWebsite(page, fixture.url('/ready'))
        if (missing === 'mismatched-request') {
          await page.setExtraHTTPHeaders({ 'If-None-Match': '"other-v2"' })
        }
        if (missing === 'request-validator') {
          // 此测试明确关闭缓存来构造缺少浏览器条件头的错误 304，正常正例始终使用真实缓存。
          await page.route('**/cached', async (route) => {
            const headers = { ...route.request().headers() }
            delete headers['if-none-match']
            await route.continue({ headers })
          })
        }
        if (missing === 'same-url') {
          await page.setExtraHTTPHeaders({ 'If-None-Match': '"ready-v1"' })
        }
        await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
          document.documentElement.dataset.hasHydrated = 'true'
        }))
        const pathname = missing === 'same-url' ? '/invalid304' : '/cached'
        await expect(navigateWebsite(page, fixture.url(pathname))).rejects.toThrow(/HTTP 304/)
        expect(fixture.requests.filter(request => request.path === pathname).at(-1)?.status).toBe(304)
        if (missing === 'mismatched-request' || missing === 'request-validator') {
          expect(fixture.requests.filter(request => request.path === pathname).at(-1)?.validator)
            .toBe(missing === 'mismatched-request' ? '"other-v2"' : undefined)
        }
        expect(listenerCounts(page)).toEqual(before)
      }
      finally {
        await fixture.dispose()
      }
    })
  }
})
