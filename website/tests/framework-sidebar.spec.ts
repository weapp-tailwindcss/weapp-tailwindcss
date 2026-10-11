import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'https://tw.weapp.dev/'
const frameworkLogos = [
  'html5',
  'expo',
  'lynx',
  'uni-app',
  'vite',
  'hbuilderx',
  'uni-app-x',
  'taro',
  'weapp-vite',
  'mpx',
  'nodejs',
] as const

async function expandCategory(page: Page, name: string) {
  const category = page.getByRole('button', { name, exact: true })
  if (await category.getAttribute('aria-expanded') === 'false') {
    await category.click()
  }
  await expect(category).toHaveAttribute('aria-expanded', 'true')
}

for (const route of ['/docs/quick-start/install', '/zh-cn/docs/quick-start/install']) {
  test(`${route} renders package manager logos and keeps tabs interactive`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(new URL(route, baseURL).toString(), { waitUntil: 'networkidle' })

    const tabs = page.locator('.theme-tabs-container').first()
    const expectedTabs = [
      { name: 'npm', icon: 'logos--npm-icon' },
      { name: 'Yarn', icon: 'logos--yarn' },
      { name: 'pnpm', icon: 'logos--pnpm' },
      { name: 'Bun', icon: 'logos--bun' },
    ] as const

    for (const { icon, name } of expectedTabs) {
      const tab = tabs.getByRole('tab', { name, exact: true })
      const logo = tab.locator(`[class~="icon-[${icon}]"]`)
      await expect(tab).toBeVisible()
      await expect(logo).toHaveCount(1)

      const style = await logo.evaluate((element) => {
        const computedStyle = getComputedStyle(element)
        const box = element.getBoundingClientRect()
        return {
          backgroundImage: computedStyle.backgroundImage,
          height: box.height,
          maskImage: computedStyle.maskImage,
          width: box.width,
        }
      })

      expect(style.backgroundImage !== 'none' || style.maskImage !== 'none').toBe(true)
      expect(style.width).toBeCloseTo(18, 0)
      expect(style.height).toBeCloseTo(18, 0)
    }

    const tabList = tabs.getByRole('tablist')
    expect(await tabList.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)

    await tabs.getByRole('tab', { name: 'pnpm', exact: true }).click()
    await expect(tabs.getByRole('tab', { name: 'pnpm', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(tabs.getByRole('tabpanel')).toContainText('pnpm add')
  })

  test(`${route} renders framework logos for every setup item`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(new URL(route, baseURL).toString(), { waitUntil: 'networkidle' })

    for (const category of ['uni-app', 'Taro', 'Weapp-vite', 'Mpx']) {
      await expandCategory(page, category)
    }

    const items = page.locator('.theme-doc-sidebar-menu .framework-sidebar-item')
    await expect(items).toHaveCount(15)

    for (const logo of frameworkLogos) {
      const logoItems = page.locator(`.framework-sidebar-item--${logo}`)
      expect(await logoItems.count()).toBeGreaterThan(0)

      const style = await logoItems.first().locator(':scope > .menu__link, :scope > .menu__list-item-collapsible > .menu__link').first().evaluate((element) => {
        const pseudo = getComputedStyle(element, '::before')
        const label = element.querySelector('span')?.getBoundingClientRect()
        const link = element.getBoundingClientRect()
        return {
          backgroundImage: pseudo.backgroundImage,
          height: pseudo.height,
          width: pseudo.width,
          labelStartsAfterIcon: label ? label.left > link.left + 20 : false,
        }
      })

      expect(style.backgroundImage).not.toBe('none')
      expect(Number.parseFloat(style.width)).toBeCloseTo(24.8, 1)
      expect(Number.parseFloat(style.height)).toBeCloseTo(24.8, 1)
      expect(style.labelStartsAfterIcon).toBe(true)
    }
  })
}
