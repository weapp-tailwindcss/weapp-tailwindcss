import process from 'node:process'
import { expect, test } from '@playwright/test'
import routes from '../routes.json'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'https://tw.weapp.dev/'
const CHINESE_TEXT_RE = /[\u3000-\u303F\u3400-\u9FFF\uF900-\uFAFF\uFE10-\uFE1F\uFF01-\uFF60]/

function assertContainsNoChinese(value: string, context: string) {
  expect(value, `${context} contains Chinese text`).not.toMatch(CHINESE_TEXT_RE)
}

async function getNaturalLanguageText(page: import('@playwright/test').Page) {
  return page.locator('body').evaluate((body) => {
    const copy = body.cloneNode(true) as HTMLElement
    copy.querySelectorAll('a[lang^="zh"], svg, script, style').forEach(node => node.remove())
    return copy.textContent ?? ''
  })
}

async function getNaturalLanguageAttributes(page: import('@playwright/test').Page) {
  return page.locator('body').evaluate((body) => {
    const attributes = ['alt', 'aria-label', 'placeholder', 'title']
    return [...body.querySelectorAll<HTMLElement>('*')]
      .filter(element => !element.closest('a[lang^="zh"]'))
      .flatMap(element => attributes.map(attribute => element.getAttribute(attribute)))
      .filter((value): value is string => Boolean(value))
      .join('\n')
  })
}

async function getGeneratedContentText(page: import('@playwright/test').Page) {
  return page.locator('body').evaluate((body) => {
    return [...body.querySelectorAll<HTMLElement>('*')]
      .flatMap(element => ['::before', '::after'].map(pseudoElement => getComputedStyle(element, pseudoElement).content))
      .filter(value => value !== 'none' && value !== 'normal')
      .join('\n')
  })
}

function assertStructuredDataLocale(value: string, context: string) {
  const visit = (entry: unknown): void => {
    if (Array.isArray(entry)) {
      entry.forEach(visit)
      return
    }
    if (!entry || typeof entry !== 'object') {
      return
    }

    const record = entry as Record<string, unknown>
    if (typeof record.inLanguage === 'string') {
      expect(record.inLanguage, `${context} should use English`).toBe('en-US')
    }
    Object.values(record).forEach(visit)
  }

  visit(JSON.parse(value))
}

const englishRoutes = [
  '/',
  ...routes.filter(route => route !== '/zh-cn' && !route.startsWith('/zh-cn/')),
]

test.describe('English content isolation', () => {
  for (const route of new Set(englishRoutes)) {
    test(`English route ${route}`, async ({ page }) => {
      const response = await page.goto(new URL(route, baseURL).toString(), {
        waitUntil: 'domcontentloaded',
      })
      expect(response?.ok(), `${route} should return a successful response`).toBe(true)

      assertContainsNoChinese(await getNaturalLanguageText(page), `${route} main content`)
      assertContainsNoChinese(await getNaturalLanguageAttributes(page), `${route} natural-language attributes`)
      assertContainsNoChinese(await getGeneratedContentText(page), `${route} generated CSS content`)
      assertContainsNoChinese(await page.title(), `${route} title`)
      await expect(page.locator('html')).toHaveAttribute('lang', /^en/i)
      await expect(page.locator('meta[http-equiv="Content-Language"]')).toHaveAttribute('content', /^en/i)
      await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'en_US')

      const canonical = await page.locator('link[rel="canonical"]').first().getAttribute('href')
      expect(canonical, `${route} canonical should target the English site`).not.toContain('/zh-cn')
      const englishAlternates = await page.locator('link[rel="alternate"][hreflang="en-US"]').evaluateAll(elements => elements.map(element => element.getAttribute('href')))
      expect(englishAlternates.length, `${route} should expose an English alternate`).toBeGreaterThan(0)
      expect(englishAlternates.every(href => href && !href.includes('/zh-cn')), `${route} English alternates should target the English site`).toBe(true)
      const chineseAlternates = await page.locator('link[rel="alternate"][hreflang="zh-CN"]').evaluateAll(elements => elements.map(element => element.getAttribute('href')))
      expect(chineseAlternates.length, `${route} should expose a Chinese alternate`).toBeGreaterThan(0)
      expect(chineseAlternates.every(href => href?.includes('/zh-cn')), `${route} Chinese alternates should target the Chinese site`).toBe(true)

      const description = await page.locator('meta[name="description"]').getAttribute('content')
      if (description) {
        assertContainsNoChinese(description, `${route} description`)
      }

      const structuredData = await page.locator('script[type="application/ld+json"]').allTextContents()
      for (const value of structuredData) {
        assertContainsNoChinese(value, `${route} structured data`)
        assertStructuredDataLocale(value, `${route} structured data`)
      }
    })
  }

  test('English navbar exposes showcase and options', async ({ page }) => {
    await page.goto(baseURL, {
      waitUntil: 'domcontentloaded',
    })

    const navbar = page.locator('nav')
    await expect(navbar.getByRole('link', { name: 'Showcase', exact: true })).toHaveAttribute('href', '/docs/showcase')
    await expect(navbar.getByRole('link', { name: 'Options', exact: true })).toHaveAttribute('href', '/docs/api/interfaces/UserDefinedOptions')
  })

  test('locale menu names both languages and English 404 contains no Chinese text', async ({ page }) => {
    await page.goto(baseURL, {
      waitUntil: 'domcontentloaded',
    })

    const localeDropdown = page.locator('.navbar__item.dropdown').filter({ hasText: 'English' }).first()
    await localeDropdown.hover()
    await expect(localeDropdown.locator('a[lang^="zh"]')).toHaveText('中文')
    await expect(localeDropdown.locator('a[lang^="zh"]')).toHaveAttribute('href', '/zh-cn/')

    const response = await page.goto(new URL('/404.html', baseURL).toString(), {
      waitUntil: 'domcontentloaded',
    })
    expect(response?.ok()).toBe(true)
    assertContainsNoChinese(await getNaturalLanguageText(page), 'English 404 body')
    assertContainsNoChinese(await page.title(), 'English 404 title')
  })

  test('English LLM assets and blog feeds contain no Chinese text', async ({ request }) => {
    const assetPaths = [
      '/llms-index.json',
      '/llms-index-full.json',
      '/llms.txt',
      '/llms-full.txt',
      '/llms-quickstart.txt',
      '/llms-api.txt',
      '/wetw/registry.json',
      '/blog/rss.xml',
      '/blog/atom.xml',
      '/blog/feed.json',
    ]

    for (const assetPath of assetPaths) {
      const response = await request.get(new URL(assetPath, baseURL).toString())
      expect(response.ok(), `${assetPath} should return a successful response`).toBe(true)
      assertContainsNoChinese(await response.text(), assetPath)
    }
  })
})
