import type { Page } from '@playwright/test'
import type { EventEmitter } from 'node:events'
import { expect, test } from '@playwright/test'
import { navigateWebsite, reloadWebsite } from './helpers/navigation'
import { analyticsUrls, fixtureUrl, installReadinessFixture } from './helpers/readiness-fixture'

function requestListenerCount(page: Page) {
  // Page 的事件发射器实现提供此观测接口，公开类型仅声明 on/off。
  return (page as unknown as EventEmitter).listenerCount('request')
}

test.describe('website navigation readiness', () => {
  for (const reportingUrl of analyticsUrls) {
    test(`waits for local CSS and runtime while reporting remains pending: ${new URL(reportingUrl).hostname}`, async ({ page }) => {
      const fixture = await installReadinessFixture(page, { reportingUrl })
      let ready = false
      const navigation = navigateWebsite(page, fixtureUrl).then(() => {
        ready = true
      })
      try {
        await expect.poll(() => fixture.started.has(reportingUrl)).toBe(true)
        await page.waitForTimeout(600)
        expect(ready).toBe(false)
        fixture.releaseCss()
        await page.waitForTimeout(600)
        expect(ready).toBe(false)
        fixture.releaseScript()
        await expect.poll(() => ready, { timeout: 2_000 }).toBe(true)
        await navigation
        await expect(page.locator('button')).toHaveCSS('color', 'rgb(12, 34, 56)')
        await page.locator('button').click()
        await expect(page.locator('output')).toHaveText('clicked')
        await expect(page.waitForLoadState('networkidle', { timeout: 750 })).rejects.toThrow(/Timeout/)
      }
      finally {
        await fixture.dispose()
        await navigation
      }
    })
  }

  test('waits for remote business data and applies the same boundary on reload', async ({ page }) => {
    const businessUrl = 'https://registry.example.test/package'
    const fixture = await installReadinessFixture(page, { businessUrl })
    let ready = false
    const navigation = navigateWebsite(page, fixtureUrl).then(() => {
      ready = true
    })
    try {
      fixture.releaseCss()
      fixture.releaseScript()
      await expect.poll(() => fixture.started.has(businessUrl)).toBe(true)
      await page.waitForTimeout(650)
      expect(ready).toBe(false)
      fixture.releaseBusiness()
      await navigation
      await reloadWebsite(page)
      await expect(page.locator('button')).toHaveCSS('color', 'rgb(12, 34, 56)')
    }
    finally {
      await fixture.dispose()
      await navigation
    }
  })

  for (const reportingUrl of [
    'https://www.google-analytics.com/g/collect/',
    'https://www.google.com/other',
    'https://www.google-analytics.com.example.test/g/collect',
    'https://www.google-analytics.com:8443/g/collect',
  ]) {
    test(`keeps non-reporting requests in the readiness boundary: ${reportingUrl}`, async ({ page }) => {
      const fixture = await installReadinessFixture(page, { reportingUrl })
      let ready = false
      const navigation = navigateWebsite(page, fixtureUrl).then(() => {
        ready = true
      })
      try {
        fixture.releaseCss()
        fixture.releaseScript()
        await expect.poll(() => fixture.started.has(reportingUrl)).toBe(true)
        await page.waitForTimeout(650)
        expect(ready).toBe(false)
        fixture.releaseReporting()
        await navigation
      }
      finally {
        await fixture.dispose()
        await navigation
      }
    })
  }

  test('waits for an iframe even when its document URL matches reporting', async ({ page }) => {
    const iframeUrl = analyticsUrls[1]
    const fixture = await installReadinessFixture(page, { iframeUrl })
    let ready = false
    const navigation = navigateWebsite(page, fixtureUrl).then(() => {
      ready = true
    })
    try {
      fixture.releaseCss()
      fixture.releaseScript()
      await expect.poll(() => fixture.started.has(iframeUrl)).toBe(true)
      await page.waitForTimeout(650)
      expect(ready).toBe(false)
      fixture.releaseIframe()
      await navigation
      await expect(page.frameLocator('iframe').locator('p')).toHaveText('iframe ready')
    }
    finally {
      await fixture.dispose()
      await navigation
    }
  })

  for (const redirect of [false, true]) {
    test(`rejects an unsuccessful final document response (client redirect: ${redirect})`, async ({ page }) => {
      const fixture = await installReadinessFixture(page, { status: 500, redirect })
      const listenerCount = requestListenerCount(page)
      try {
        fixture.releaseCss()
        fixture.releaseScript()
        await expect(navigateWebsite(page, fixtureUrl)).rejects.toThrow('HTTP 500')
        expect(requestListenerCount(page)).toBe(listenerCount)
      }
      finally {
        await fixture.dispose()
      }
    })
  }

  test('waits for non-fetch scripts at the reporting endpoint', async ({ page }) => {
    const fixture = await installReadinessFixture(page, { reportingAsScript: true })
    let ready = false
    const navigation = navigateWebsite(page, fixtureUrl).then(() => {
      ready = true
    })
    try {
      fixture.releaseCss()
      fixture.releaseScript()
      await expect.poll(() => fixture.started.has(analyticsUrls[0])).toBe(true)
      await page.waitForTimeout(650)
      expect(ready).toBe(false)
      fixture.releaseReporting()
      await navigation
    }
    finally {
      await fixture.dispose()
      await navigation
    }
  })

  test('waits for reporting-shaped fetches inside an iframe', async ({ page }) => {
    const iframeFetchUrl = analyticsUrls[1]
    const fixture = await installReadinessFixture(page, { iframeFetchUrl })
    let ready = false
    const navigation = navigateWebsite(page, fixtureUrl).then(() => {
      ready = true
    })
    try {
      fixture.releaseCss()
      fixture.releaseScript()
      await expect.poll(() => fixture.started.has(iframeFetchUrl)).toBe(true)
      await page.waitForTimeout(650)
      expect(ready).toBe(false)
      fixture.releaseIframe()
      await navigation
    }
    finally {
      await fixture.dispose()
      await navigation
    }
  })

  test('uses the final client-redirected document and discards old pending requests', async ({ page }) => {
    const fixture = await installReadinessFixture(page, { redirect: true })
    const listenerCount = requestListenerCount(page)
    try {
      fixture.releaseCss()
      fixture.releaseScript()
      const response = await navigateWebsite(page, fixtureUrl)
      expect(response.url()).toBe(new URL('/zh-cn/', fixtureUrl).href)
      expect(fixture.started.has(new URL('/obsolete', fixtureUrl).href)).toBe(true)
      expect(requestListenerCount(page)).toBe(listenerCount)
      await expect(page.locator('button')).toHaveCSS('color', 'rgb(12, 34, 56)')
    }
    finally {
      await fixture.dispose()
    }
  })
})
