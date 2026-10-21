import { expect, test } from '@playwright/test'
import { navigateWebsite } from './helpers/navigation'
import { followWebsiteLink } from './helpers/navigation-link'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'https://tw.weapp.dev/'

test('客户端 URL 提前更新时仍等待真实路由 chunk 和页面提交，再允许硬导航', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('weapp-tailwindcss:website:locale', 'en'))
  await navigateWebsite(page, baseURL)
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let blocked = 0
  await page.route(/\/assets\/js\/[^/]+\.js$/, async (route) => {
    blocked += 1
    await gate
    await route.continue()
  })
  let completed = false
  const destination = new URL('/docs/quick-start/react-native-expo', baseURL).href
  const navigation = followWebsiteLink(page, page.getByRole('link', { name: 'React Native', exact: true }), {
    url: destination,
    ready: page.locator('article h1').filter({ hasText: 'React Native' }),
  }).then(() => { completed = true })
  try {
    await expect.poll(() => blocked).toBeGreaterThan(0)
    await expect(page).toHaveURL(destination)
    await page.waitForTimeout(650)
    expect(completed, 'URL 已变但真实路由模块未交付，导航不能提前成功').toBe(false)
    release()
    await navigation
    await expect(page.locator('article h1')).toContainText('React Native')
    await navigateWebsite(page, baseURL)
    await expect(page.getByRole('link', { name: 'React Native', exact: true })).toBeVisible()
  }
  finally {
    release()
    await navigation
    await page.unroute(/\/assets\/js\/[^/]+\.js$/)
  }
})
