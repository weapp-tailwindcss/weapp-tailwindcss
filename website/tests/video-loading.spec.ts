import { expect, test } from '@playwright/test'
import { navigateWebsite } from './helpers/navigation'
import { videoDocuments, withVideoFixture } from './helpers/video-fixture'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'https://tw.weapp.dev/'

for (const document of videoDocuments) {
  test(`loads embedded video only after keyboard activation: ${document.file}`, async ({ page }, testInfo) => {
    await withVideoFixture(document.file, testInfo.project.testDir, async (fixture) => {
      await page.goto(fixture.url, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(650)
      await testInfo.attach('initial-network.json', { body: JSON.stringify({ requests: fixture.requests, unfinishedStreams: fixture.streams.size }), contentType: 'application/json' })
      expect(fixture.requests, '阅读文档不应自动创建播放器或视频流请求').toEqual([])
      await navigateWebsite(page, fixture.url)
      const summary = page.locator('summary', { hasText: document.summary })
      await summary.scrollIntoViewIfNeeded()
      await page.waitForTimeout(650)
      expect(fixture.requests, '滚动到视频入口仍须等待用户展开').toEqual([])
      await testInfo.attach('collapsed-full-page.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
      await page.waitForTimeout(650)
      await expect(page.locator('details')).not.toHaveAttribute('open', '')
      expect(fixture.requests, '整页截图不应展开或预加载视频').toEqual([])
      await summary.focus()
      await page.keyboard.press('Enter')
      await expect(page.locator('details')).toHaveAttribute('open', '')
      const frame = page.frameLocator('iframe')
      await expect(frame.getByText('Video player ready')).toBeVisible()
      await expect.poll(() => fixture.streams.size).toBe(1)
      expect(fixture.requests.filter(url => url === '/player.html')).toHaveLength(1)
      await expect(page.locator('iframe')).toHaveAttribute('src', fixture.fixtureSrc)
      await expect(page.locator('iframe')).toHaveAttribute('title', document.title)
      await expect(page.locator('iframe')).toHaveAttribute('allowfullscreen', 'true')
      expect(new URL(fixture.fixtureSrc).origin).not.toBe(new URL(fixture.url).origin)
      const originalUrl = new URL(fixture.originalSrc, 'https://website.test')
      expect(originalUrl.origin).toBe('https://player.bilibili.com')
      expect(originalUrl.pathname).toBe('/player.html')
      expect(originalUrl.searchParams.get('aid')).toBe(document.aid)
      expect(originalUrl.searchParams.get('bvid')).toBe(document.bvid)
      expect(originalUrl.searchParams.get('cid')).toBe(document.cid)
      expect(originalUrl.searchParams.get('p')).toBe('1')
      expect(originalUrl.searchParams.get('autoplay')).toBe('0')
      await frame.getByRole('button', { name: 'Play demonstration' }).click()
      await expect(frame.locator('output')).toHaveText('playing')
      await expect(page.waitForLoadState('networkidle', { timeout: 750 })).rejects.toThrow(/Timeout/)
    })
  })
}

test.describe('static video fallback', () => {
  test.use({ javaScriptEnabled: false })
  for (const document of videoDocuments) {
    test(`keeps a video link without JavaScript: ${document.file}`, async ({ page }) => {
      const response = await page.goto(new URL(document.route, baseURL).href, { waitUntil: 'domcontentloaded' })
      expect(response?.ok()).toBe(true)
      const link = page.getByRole('link', { name: document.link, exact: true })
      await expect(link).toBeVisible()
      await expect(link).toHaveAttribute('href', `https://www.bilibili.com/video/${document.bvid}/`)
    })
  }
})
