import { expect, test } from '@playwright/test'
import catalog from '../src/components/docs/showcase/catalog.json'
import { navigateWebsite } from './helpers/navigation'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'https://tw.weapp.dev/'

for (const locale of ['en', 'zh-cn']) {
  test.describe(`showcase page (${locale})`, () => {
    const route = locale === 'en' ? '/docs/showcase' : '/zh-cn/docs/showcase'
    const expectedImages = catalog.entries.flatMap(entry => [entry.primaryImage.src, ...entry.screenshots.map(image => image.src)])
    test('shows a first-screen mini program index and compact screenshots', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 1000 })
      await navigateWebsite(page, new URL(route, baseURL).toString())

      const index = page.locator('.showcase-index')
      await expect(index).toBeVisible()
      await expect(index.locator('.showcase-index__item')).toHaveCount(catalog.entries.length)

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

      const anchor = `showcase-${catalog.entries[0].id}`
      const firstCardTitle = page.locator(`[id="${anchor}"]`)
      await index.locator(`a[href="#${anchor}"]`).click()
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
      await navigateWebsite(page, new URL(route, baseURL).toString())

      const index = page.locator('.showcase-index')
      await expect(index).toBeVisible()
      await expect(index.locator('.showcase-index__item')).toHaveCount(catalog.entries.length)

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

    test('keeps every translated link and image tied to the shared catalog', async ({ page }, testInfo) => {
      await navigateWebsite(page, new URL(route, baseURL).toString())
      await expect(page.locator('.showcase-card')).toHaveCount(catalog.entries.length)
      await expect(page.locator('.theme-doc-markdown')).not.toContainText('pnpm showcase:update')
      const links = await page.locator('.showcase-index__item').evaluateAll(elements => elements.map((element) => {
        const link = element as HTMLAnchorElement
        const id = decodeURIComponent(link.hash.slice(1))
        const target = document.getElementById(id)
        const label = link.querySelector('.showcase-index__item-title')?.textContent
        return { id, count: [...document.querySelectorAll('[id]')].filter(element => element.id === id).length, title: target?.textContent?.replace(/#$/, '').trim(), label, legacyAlias: Boolean(label && document.getElementById(label) === target?.closest('article')) }
      }))
      expect(links.map(link => link.id)).toEqual(catalog.entries.map(entry => `showcase-${entry.id}`))
      for (const link of links) {
        expect(link.count).toBe(1)
        expect(link.title).toBe(link.label)
        expect(link.legacyAlias).toBe(true)
      }
      const images = await page.locator('.showcase-card__image').evaluateAll(elements => elements.map(element => element.getAttribute('src')))
      expect(images).toEqual(expectedImages)
      const responses = []
      for (const src of expectedImages) {
        const response = await page.request.get(new URL(src, baseURL).href)
        responses.push({ src, status: response.status(), type: response.headers()['content-type'] })
        expect(response.ok(), src).toBe(true)
        expect(response.headers()['content-type'], src).toMatch(/^image\//)
      }
      const decoded = await page.evaluate(async (sources) => {
        return await Promise.all(sources.map(async (src) => {
          const image = new Image()
          image.src = src
          await image.decode()
          return { src, width: image.naturalWidth, height: image.naturalHeight }
        }))
      }, expectedImages)
      expect(decoded.every(image => image.width > 0 && image.height > 0)).toBe(true)
      const legacyUrl = new URL(`${route}#${encodeURIComponent(links[0].label!)}`, baseURL).href
      await page.goto(legacyUrl)
      await expect(page).toHaveURL(legacyUrl)
      await expect(page.locator('.showcase-card').first()).toBeInViewport()
      await testInfo.attach('showcase-assets.json', { body: JSON.stringify({ locale, links, responses, decoded }), contentType: 'application/json' })
    })
  })
}
