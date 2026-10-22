import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { withWebsiteNavigation } from './navigation'

/** 链接导航必须保留目标 URL 与页面提交的独立断言。 */
export async function followWebsiteLink(page: Page, link: Locator, destination: { url: string | RegExp, ready: Locator }) {
  return withWebsiteNavigation(page, async () => {
    await link.click()
    await expect(page).toHaveURL(destination.url)
    await expect(destination.ready).toBeVisible()
    return null
  })
}
