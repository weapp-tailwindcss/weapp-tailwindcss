import process from 'node:process'
import { expect, test } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'https://tw.weapp.dev/'

test.describe('SEO and GEO metadata', () => {
  for (const [pathname, canonical] of [
    ['/docs/intro', 'https://tw.weapp.dev/docs/intro'],
    ['/zh-cn/docs/intro', 'https://tw.weapp.dev/zh-cn/docs/intro'],
  ]) {
    test(`${pathname} exposes one canonical and a linked entity graph`, async ({ page }) => {
      const response = await page.goto(new URL(pathname, baseURL).toString(), { waitUntil: 'domcontentloaded' })
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(1)
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonical)
      await expect(page.locator('link[rel="alternate"][hreflang="en-US"]')).toHaveCount(1)
      await expect(page.locator('link[rel="alternate"][hreflang="zh-CN"]')).toHaveCount(1)
      await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute('href', 'https://tw.weapp.dev/docs/intro')
      await expect(page.locator('meta[name="geo.region"], meta[name="ICBM"]')).toHaveCount(0)

      const html = await response?.text() ?? ''
      for (const type of ['Organization', 'WebSite', 'SoftwareSourceCode', 'TechArticle', 'BreadcrumbList']) {
        expect(html).toContain(`"@type":"${type}"`)
      }
      expect(html).not.toContain('contentLocation')
    })
  }

  test('dual GEO indexes and Workers redirects are public', async ({ request }) => {
    for (const [pathname, locale, tier] of [
      ['/llms-index.json', 'en-US', 'primary'],
      ['/llms-index-full.json', 'en-US', 'full'],
      ['/zh-cn/llms-index.json', 'zh-CN', 'primary'],
      ['/zh-cn/llms-index-full.json', 'zh-CN', 'full'],
    ]) {
      const response = await request.get(new URL(pathname, baseURL).toString())
      expect(response.ok()).toBe(true)
      const payload = await response.json()
      expect(payload).toMatchObject({ locale, contentTier: tier })
    }

    const englishRedirect = await request.get(new URL('/en/docs/intro', baseURL).toString(), { maxRedirects: 0 })
    expect(englishRedirect.status()).toBe(301)
    expect(englishRedirect.headers().location).toBe('/docs/intro')
    const legacyRedirect = await request.get(new URL('/docs/migrations/v2', baseURL).toString(), { maxRedirects: 0 })
    expect(legacyRedirect.status()).toBe(301)
    expect(legacyRedirect.headers().location).toBe('/docs/migrations/v5')
  })
})
