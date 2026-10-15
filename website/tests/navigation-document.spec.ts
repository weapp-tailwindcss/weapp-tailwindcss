import type { Page, Request } from '@playwright/test'
import type { EventEmitter } from 'node:events'
import { expect, test } from '@playwright/test'
import { createDocumentFixture } from './helpers/document-fixture'
import { navigateWebsite, reloadWebsite } from './helpers/navigation'

function listenerCounts(page: Page) {
  const emitter = page as unknown as EventEmitter
  return ['request', 'response', 'requestfinished', 'requestfailed', 'framenavigated']
    .map(event => emitter.listenerCount(event))
}

test.describe('website document evidence', () => {
  test('uses a synchronously redirected document even when Firefox goto returns null', async ({ page }) => {
    const fixture = await createDocumentFixture()
    const before = listenerCounts(page)
    try {
      const response = await navigateWebsite(page, fixture.url('/redirect'))
      expect(response.status()).toBe(200)
      expect(response.url()).toBe(fixture.url('/ready'))
      await expect(page).toHaveURL(fixture.url('/ready'))
      await expect(page.locator('button')).toHaveCSS('color', 'rgb(12, 34, 56)')
      expect(listenerCounts(page)).toEqual(before)
    }
    finally {
      await fixture.dispose()
    }
  })

  test('waits for the redirected document resources and runtime', async ({ page }) => {
    const fixture = await createDocumentFixture({ holdResources: true })
    let ready = false
    let failure: unknown
    const navigation = navigateWebsite(page, fixture.url('/redirect')).then(() => {
      ready = true
    }, (error: unknown) => {
      failure = error
    })
    try {
      await expect.poll(() => fixture.requests.some(request => request.path === '/runtime.js')).toBe(true)
      await page.waitForTimeout(650)
      expect(ready).toBe(false)
      fixture.releaseCss()
      await page.waitForTimeout(650)
      expect(ready).toBe(false)
      fixture.releaseRuntime()
      await navigation
      expect(failure).toBeUndefined()
      expect(ready).toBe(true)
    }
    finally {
      fixture.releaseCss()
      fixture.releaseRuntime()
      await navigation
      await fixture.dispose()
    }
  })

  test('accepts a committed cached document after real conditional HTTP revalidation', async ({ page, browserName }) => {
    const fixture = await createDocumentFixture()
    const before = listenerCounts(page)
    try {
      expect((await navigateWebsite(page, fixture.url('/cached'))).status()).toBe(200)
      const response = await reloadWebsite(page)
      const wireRequest = fixture.requests.filter(request => request.path === '/cached').at(-1)!
      if (browserName !== 'webkit') {
        expect(wireRequest).toMatchObject({ status: 304, validator: '"ready-v1"' })
      }
      expect(response.status()).toBe(browserName === 'firefox' ? 304 : 200)
      await expect(page.locator('output')).toHaveText('ready')
      await expect(page.locator('button')).toHaveCSS('color', 'rgb(12, 34, 56)')
      expect(listenerCounts(page)).toEqual(before)
    }
    finally {
      await fixture.dispose()
    }
  })

  test('retains the same Vary request identity during real cached round trips', async ({ page, browserName }) => {
    const fixture = await createDocumentFixture({ vary: 'Accept-Language' })
    try {
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'zh-CN' })
      await navigateWebsite(page, fixture.url('/cached'))
      for (let round = 0; round < 2; round += 1) {
        await navigateWebsite(page, fixture.url('/ready'))
        const response = await navigateWebsite(page, fixture.url('/cached'))
        expect(response.status()).toBe(browserName === 'chromium' ? 200 : 304)
        expect(fixture.requests.filter(request => request.path === '/cached').at(-1))
          .toMatchObject({ status: 304, validator: '"ready-v1"' })
        await expect(page.locator('output')).toHaveText('ready')
      }
    }
    finally {
      await fixture.dispose()
    }
  })

  test('reuses a complete intermediate locale representation without reusing its old runtime', async ({ page, browserName }) => {
    const fixture = await createDocumentFixture()
    const before = listenerCounts(page)
    try {
      await navigateWebsite(page, fixture.url('/locale'))
      await expect(page).toHaveURL(fixture.url('/ready'))
      await page.evaluate(() => localStorage.setItem('locale', 'en'))
      for (let round = 0; round < 2; round += 1) {
        const response = await navigateWebsite(page, fixture.url('/locale'))
        expect(response.status()).toBe(browserName === 'chromium' ? 200 : 304)
        expect(fixture.requests.filter(request => request.path === '/locale').at(-1))
          .toMatchObject({ status: 304, validator: '"ready-v1"' })
        await expect(page.locator('output')).toHaveText('ready')
        await expect(page.locator('button')).toHaveCSS('color', 'rgb(12, 34, 56)')
        await navigateWebsite(page, fixture.url('/ready'))
      }
      expect(listenerCounts(page)).toEqual(before)
    }
    finally {
      await fixture.dispose()
    }
  })

  for (const historyRoute of [false, true]) {
    test(`revalidates a cached document across two round trips (History API: ${historyRoute})`, async ({ page, browserName }) => {
      const fixture = await createDocumentFixture()
      const before = listenerCounts(page)
      try {
        expect((await navigateWebsite(page, fixture.url('/cached'))).status()).toBe(200)
        for (let round = 0; round < 2; round += 1) {
          if (historyRoute) {
            await page.evaluate(() => history.pushState(null, '', '/client-route'))
          }
          else {
            await navigateWebsite(page, fixture.url('/ready'))
          }
          const response = await navigateWebsite(page, fixture.url('/cached'))
          expect(fixture.requests.filter(request => request.path === '/cached').at(-1))
            .toMatchObject({ status: 304, validator: '"ready-v1"' })
          expect(response.status()).toBe(browserName === 'chromium' ? 200 : 304)
          await expect(page.locator('output')).toHaveText('ready')
          await expect(page.locator('button')).toHaveCSS('color', 'rgb(12, 34, 56)')
        }
        expect(listenerCounts(page)).toEqual(before)
      }
      finally {
        await fixture.dispose()
      }
    })
  }

  for (const historyRoute of [false, true]) {
    test(`reuses the verified document on fragment navigation and waits for business requests (History API: ${historyRoute})`, async ({ page }) => {
      const fixture = await createDocumentFixture()
      const before = listenerCounts(page)
      let navigation: Promise<unknown> | undefined
      try {
        const response = await navigateWebsite(page, fixture.url('/ready'))
        if (historyRoute) {
          await page.evaluate(() => history.pushState(null, '', '/client-route'))
        }
        let ready = false
        let failure: unknown
        navigation = navigateWebsite(page, fixture.url(`${historyRoute ? '/client-route' : '/ready'}#part`)).then((result) => {
          ready = true
          expect(result).toBe(response)
        }, (error: unknown) => {
          failure = error
        })
        await expect.poll(() => fixture.requests.some(request => request.path === '/business')).toBe(true)
        await page.waitForTimeout(650)
        expect(ready).toBe(false)
        fixture.releaseBusiness()
        await navigation
        expect(failure).toBeUndefined()
        expect(ready).toBe(true)
        expect(fixture.requests.filter(request => request.path === '/ready')).toHaveLength(1)
        expect(fixture.requests.filter(request => request.path === '/client-route')).toHaveLength(0)
        await expect(page.locator('output')).toHaveText('business ready')
        expect(listenerCounts(page)).toEqual(before)
      }
      finally {
        fixture.releaseBusiness()
        await navigation
        await fixture.dispose()
      }
    })
  }

  test('does not reuse verified evidence after an external navigation creates a new document', async ({ page }) => {
    const fixture = await createDocumentFixture()
    const before = listenerCounts(page)
    try {
      await navigateWebsite(page, fixture.url('/ready'))
      await page.goto(fixture.url('/ready'), { waitUntil: 'load' })
      fixture.releaseBusiness()
      await expect(navigateWebsite(page, fixture.url('/ready#part'))).rejects.toThrow(/网站导航失败/)
      expect(listenerCounts(page)).toEqual(before)
    }
    finally {
      await fixture.dispose()
    }
  })

  test('rejects a fragment with no prior verified document response', async ({ page }) => {
    const fixture = await createDocumentFixture()
    const before = listenerCounts(page)
    try {
      await page.goto(fixture.url('/ready'), { waitUntil: 'load' })
      fixture.releaseBusiness()
      await expect(navigateWebsite(page, fixture.url('/ready#part'))).rejects.toThrow(/网站导航失败/)
      expect(listenerCounts(page)).toEqual(before)
    }
    finally {
      await fixture.dispose()
    }
  })

  for (const pathname of ['/invalid304', '/error', '/redirect-error', '/failed', '/redirect-failed']) {
    test(`rejects invalid final document evidence: ${pathname}`, async ({ page }) => {
      const fixture = await createDocumentFixture()
      const failures: string[] = []
      const onFailed = (request: Request) => failures.push(request.url())
      page.on('requestfailed', onFailed)
      const before = listenerCounts(page)
      try {
        if (pathname === '/invalid304') {
          // 错误页即使伪造 hydration 和缓存响应头，也不能替代浏览器的有效正文记录。
          await page.addInitScript(() => {
            document.addEventListener('DOMContentLoaded', () => {
              document.documentElement.dataset.hasHydrated = 'true'
            })
          })
        }
        await navigateWebsite(page, fixture.url('/ready'))
        await expect(navigateWebsite(page, fixture.url(pathname))).rejects.toThrow(
          pathname.includes('error') ? /HTTP 500/ : pathname === '/invalid304' ? /HTTP 304|ERR_ABORTED/ : undefined,
        )
        if (pathname.includes('failed')) {
          expect(failures).toContain(fixture.url('/failed'))
        }
        expect(listenerCounts(page)).toEqual(before)
      }
      finally {
        page.off('requestfailed', onFailed)
        await fixture.dispose()
      }
    })
  }
})
