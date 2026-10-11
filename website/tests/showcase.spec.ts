import { expect, test } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'https://tw.weapp.dev/'

test.describe('showcase page', () => {
  test('shows a first-screen mini program index and compact screenshots', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(new URL('/docs/showcase', baseURL).toString(), {
      waitUntil: 'networkidle',
    })

    const index = page.locator('.showcase-index')
    await expect(index).toBeVisible()
    await expect(index.locator('.showcase-index__item')).toHaveCount(13)

    const firstViewport = await index.boundingBox()
    expect(firstViewport?.y ?? 1000).toBeLessThan(260)
    expect(firstViewport?.height ?? 0).toBeGreaterThan(250)

    const indexMetrics = await index.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const list = element.querySelector('.showcase-index__list')
      const listStyle = list ? getComputedStyle(list) : undefined
      return {
        bottom: rect.bottom,
        gridTemplateColumns: getComputedStyle(element).gridTemplateColumns,
        listColumns: listStyle?.gridTemplateColumns ?? '',
      }
    })
    expect(indexMetrics.bottom).toBeLessThan(820)
    expect(indexMetrics.gridTemplateColumns.split(' ').length).toBeGreaterThanOrEqual(2)
    expect(indexMetrics.listColumns.split(' ').length).toBeGreaterThanOrEqual(2)

    const firstCardTitle = page.locator('#区白白')
    await index.locator('a[href="#区白白"]').click()
    await expect(firstCardTitle).toBeInViewport()

    const screenshotStyle = await page
      .locator('.showcase-card__image-button--shot .showcase-card__shot')
      .first()
      .evaluate((element) => {
        const style = getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return {
          height: rect.height,
          objectFit: style.objectFit,
          objectPosition: style.objectPosition,
          width: rect.width,
        }
      })
    expect(screenshotStyle.height).toBeGreaterThan(150)
    expect(screenshotStyle.height).toBeLessThan(260)
    expect(screenshotStyle.objectFit).toBe('cover')
    expect(screenshotStyle.objectPosition).toContain('0%')
    expect(screenshotStyle.width).toBeGreaterThan(90)

    const codeStyle = await page
      .locator('.showcase-card__image-button--code .showcase-card__image')
      .first()
      .evaluate(element => getComputedStyle(element).objectFit)
    expect(codeStyle).toBe('contain')

    const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth)
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(scrollWidth).toBeLessThanOrEqual(viewportWidth + 1)
  })

  test('keeps the showcase index usable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(new URL('/docs/showcase', baseURL).toString(), {
      waitUntil: 'networkidle',
    })

    const index = page.locator('.showcase-index')
    await expect(index).toBeVisible()
    await expect(index.locator('.showcase-index__item')).toHaveCount(13)

    const indexStyle = await index.evaluate((element) => {
      const list = element.querySelector('.showcase-index__list')
      return {
        columns: getComputedStyle(element).gridTemplateColumns,
        listColumns: list ? getComputedStyle(list).gridTemplateColumns : '',
      }
    })
    expect(indexStyle.columns.split(' ').length).toBe(1)
    expect(indexStyle.listColumns.split(' ').length).toBe(1)

    const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth)
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(scrollWidth).toBeLessThanOrEqual(viewportWidth + 1)
  })
})
