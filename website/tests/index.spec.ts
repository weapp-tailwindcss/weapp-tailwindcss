import type { Page } from '@playwright/test'
import { URL } from 'node:url'
import { devices, expect, test } from '@playwright/test'
import routes from '../routes.json'

declare global {
  interface Window {
    __themeTransitionAnimations?: Array<{
      clipPath: string[]
      duration?: number
      easing?: string
      fill?: string
      opacity: string[]
      pseudoElement?: string
      transform: string[]
    }>
    __themeTransitionCalls?: number
    __themeTransitionClicks?: Array<{
      clientX: number
      clientY: number
    }>
  }
}

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'https://tw.weapp.dev/'
const localeStorageKey = 'weapp-tailwindcss:website:locale'
const uiStorageKey = 'weapp-tailwindcss:website:ui'
const githubStarsCacheKey = 'weapp-tailwindcss:github-stars:weapp-tailwindcss/weapp-tailwindcss'
const npmVersionCacheKey = 'weapp-tailwindcss:latest-version'

interface ViewportCase {
  name: string
  onlyBrowser?: 'chromium' | 'firefox' | 'webkit'
  use: Parameters<typeof test.use>[0]
}

function mobileUse(device: typeof devices['iPhone 12']): Parameters<typeof test.use>[0] {
  const {
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
  } = device

  return {
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
  }
}

const viewports: ViewportCase[] = [
  {
    name: 'desktop',
    use: {
      viewport: {
        width: 1280,
        height: 720,
      },
    },
  },
  {
    name: 'mobile',
    use: mobileUse(devices['iPhone 12']),
    onlyBrowser: 'chromium',
  },
] as const

async function setStoredLocale(page: Page, locale: 'zh-cn' | 'en') {
  await page.addInitScript(({ key, value }) => {
    if (!window.localStorage.getItem(key)) {
      window.localStorage.setItem(key, value)
    }
  }, { key: localeStorageKey, value: locale })
}

async function setNavigatorLanguages(page: Page, languages: string[]) {
  await page.addInitScript((values) => {
    Object.defineProperty(window.navigator, 'language', {
      configurable: true,
      get: () => values[0] ?? 'zh-CN',
    })
    Object.defineProperty(window.navigator, 'languages', {
      configurable: true,
      get: () => values,
    })
  }, languages)
}

async function instrumentThemeTransitions(
  page: Page,
  initialTheme: 'dark' | 'light' = 'dark',
) {
  await page.addInitScript((theme) => {
    window.localStorage.setItem('theme', theme)

    document.addEventListener('click', (event) => {
      const path = event.composedPath()
      const toggle = Array.from(document.querySelectorAll('button[aria-label*="浅色/暗黑模式"]'))
        .find(button => path.includes(button) || (button.parentElement !== null && path.includes(button.parentElement)))
      if (toggle) {
        window.__themeTransitionClicks = [
          ...(window.__themeTransitionClicks ?? []),
          {
            clientX: event.clientX,
            clientY: event.clientY,
          },
        ]
      }
    }, true)

    const nativeAnimate = Element.prototype.animate
    Element.prototype.animate = function animate(keyframes, options) {
      const animation = nativeAnimate.call(this, keyframes, options)
      if (options && typeof options === 'object' && 'pseudoElement' in options) {
        const pseudoElement = String(options.pseudoElement ?? '')
        if (pseudoElement.includes('view-transition')) {
          const resolvedKeyframes = animation.effect instanceof KeyframeEffect
            ? animation.effect.getKeyframes()
            : []
          window.__themeTransitionAnimations = [
            ...(window.__themeTransitionAnimations ?? []),
            {
              clipPath: resolvedKeyframes.map(keyframe => String(keyframe.clipPath)),
              duration: typeof options.duration === 'number' ? options.duration : undefined,
              easing: options.easing,
              fill: options.fill,
              opacity: resolvedKeyframes.map(keyframe => String(keyframe.opacity)),
              pseudoElement,
              transform: resolvedKeyframes.map(keyframe => String(keyframe.transform)),
            },
          ]
        }
      }
      return animation
    }

    const nativeStartViewTransition = document.startViewTransition?.bind(document)
    if (nativeStartViewTransition) {
      document.startViewTransition = (callback) => {
        window.__themeTransitionCalls = (window.__themeTransitionCalls ?? 0) + 1
        return nativeStartViewTransition(callback)
      }
    }
  }, initialTheme)
}

test.describe('homepage hero layout', () => {
  test('desktop hero actions and platform icons stay visually compact', async ({ page }) => {
    await setStoredLocale(page, 'zh-cn')
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(baseURL, {
      waitUntil: 'networkidle',
    })

    const hero = page.locator('.home-hero')
    const platformIcons = page.locator('.home-hero__platform-icon')
    const primaryCta = page.locator('.home-hero__actions .home-cta')
    const secondaryActions = page.locator('.home-hero__actions .ui-homepage-ai-entry a, .home-hero__actions .ui-homepage-community-entry a')
    const githubBadge = page.locator('.ui-homepage-github-badge')
    const pipeline = page.locator('.home-pipeline')

    await expect(hero).toBeVisible()
    await expect(platformIcons).toHaveCount(7)
    const platformLabels = await platformIcons.evaluateAll(elements => elements.map(element => element.getAttribute('aria-label')))
    expect(platformLabels).toEqual(['Web', '小程序', 'Android', 'iOS', 'HarmonyOS', 'React Native', 'Lynx'])
    const platformHrefs = await platformIcons.evaluateAll(elements => elements.map(element => element.getAttribute('href')))
    expect(platformHrefs).toEqual([
      '/zh-cn/docs/intro',
      '/zh-cn/docs/quick-start/native/install',
      '/zh-cn/docs/quick-start/frameworks/uni-app-x',
      '/zh-cn/docs/quick-start/frameworks/uni-app-x',
      '/zh-cn/docs/quick-start/frameworks/uni-app-x',
      '/zh-cn/docs/quick-start/react-native-expo',
      '/zh-cn/docs/quick-start/frameworks/lynx',
    ])
    await expect(platformIcons.nth(0).locator('[class~="icon-[logos--html-5]"]')).toHaveCount(1)
    await expect(platformIcons.nth(1).locator('.home-hero__platform-logo--mini-program')).toHaveCount(1)
    await expect(platformIcons.nth(2).locator('[class~="icon-[bi--android2]"]')).toHaveCount(1)
    await expect(platformIcons.nth(3).locator('[class~="icon-[mdi--apple]"]')).toHaveCount(1)
    await expect(platformIcons.nth(4).locator('.home-hero__platform-logo--harmony')).toHaveCount(1)
    await expect(platformIcons.nth(5).locator('[class~="icon-[logos--react]"]')).toHaveCount(1)
    await expect(platformIcons.nth(6).locator('.home-hero__platform-logo--lynx')).toHaveCount(1)
    await expect(platformIcons.locator('img')).toHaveCount(0)
    await expect(page.locator('[class~="icon-[logos--android-icon]"], [class~="icon-[mdi--android]"]')).toHaveCount(0)
    await expect(page.locator('[class~="icon-[mdi--wechat]"], [class~="icon-[mdi--cellphone-link]"]')).toHaveCount(0)
    await expect(primaryCta).toBeVisible()
    await expect(primaryCta).toHaveText(/开始接入/)
    await expect(primaryCta).toHaveAttribute('href', '/zh-cn/docs/quick-start/install')
    await expect(secondaryActions).toHaveCount(2)
    await expect(githubBadge).toBeVisible()
    await expect(pipeline).toBeVisible()

    for (let index = 0; index < await platformIcons.count(); index += 1) {
      const box = await platformIcons.nth(index).boundingBox()
      expect(box?.width).toBeGreaterThanOrEqual(44)
      expect(box?.width).toBeLessThanOrEqual(56)
      expect(box?.height).toBeGreaterThanOrEqual(44)
      expect(box?.height).toBeLessThanOrEqual(56)

      const iconGeometry = await platformIcons.nth(index).locator('i, svg').evaluate((icon) => {
        const iconRect = icon.getBoundingClientRect()
        const containerRect = icon.parentElement!.getBoundingClientRect()
        return {
          centerOffset: Math.hypot(
            (iconRect.left + iconRect.width / 2) - (containerRect.left + containerRect.width / 2),
            (iconRect.top + iconRect.height / 2) - (containerRect.top + containerRect.height / 2),
          ),
          height: iconRect.height,
          width: iconRect.width,
        }
      })
      expect(iconGeometry.centerOffset).toBeLessThanOrEqual(1)
      expect(iconGeometry.height).toBeGreaterThanOrEqual(20)
      expect(iconGeometry.height).toBeLessThanOrEqual(32)
      expect(iconGeometry.width).toBeGreaterThanOrEqual(20)
      expect(iconGeometry.width).toBeLessThanOrEqual(42)
    }

    const primaryBox = await primaryCta.boundingBox()
    expect(primaryBox?.height).toBeGreaterThanOrEqual(44)
    expect(primaryBox?.width).toBeGreaterThan(132)
    const primaryStyle = await primaryCta.evaluate((element) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return {
        backgroundColor: style.backgroundColor,
        color: style.color,
        text: element.textContent?.trim() ?? '',
        whiteSpace: style.whiteSpace,
        width: rect.width,
      }
    })
    expect(primaryStyle.text).toContain('开始接入')
    expect(primaryStyle.backgroundColor).toBe('rgb(2, 132, 199)')
    expect(primaryStyle.color).toBe('rgb(255, 255, 255)')
    expect(primaryStyle.whiteSpace).toBe('nowrap')
    expect(primaryStyle.width).toBeLessThan(180)

    const heroRect = await hero.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        bottom: rect.bottom,
        top: rect.top,
      }
    })
    const pipelineRect = await pipeline.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        bottom: rect.bottom,
        top: rect.top,
      }
    })
    expect(heroRect.top).toBeLessThan(140)
    expect(pipelineRect.bottom).toBeLessThanOrEqual(1000)

    const githubBadgeStyle = await githubBadge.evaluate((element) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      const icon = element.querySelector('.icon-\\[mdi--github\\]')
      const iconStyle = icon ? getComputedStyle(icon) : undefined
      const iconRect = icon?.getBoundingClientRect()
      return {
        alignItems: style.alignItems,
        backgroundColor: style.backgroundColor,
        borderRadius: style.borderRadius,
        borderStyle: style.borderStyle,
        borderWidth: style.borderWidth,
        display: style.display,
        gap: style.gap,
        height: rect.height,
        iconHeight: iconRect?.height ?? 0,
        iconMaskImage: iconStyle?.maskImage ?? '',
        iconWidth: iconRect?.width ?? 0,
        minHeight: style.minHeight,
        paddingBlock: style.paddingBlock,
        paddingInline: style.paddingInline,
        width: rect.width,
      }
    })
    expect(githubBadgeStyle.display).toBe('flex')
    expect(githubBadgeStyle.alignItems).toBe('center')
    expect(githubBadgeStyle.height).toBeGreaterThanOrEqual(40)
    expect(githubBadgeStyle.width).toBeGreaterThan(120)
    expect(githubBadgeStyle.minHeight).toBe('40px')
    expect(githubBadgeStyle.gap).toBe('8px')
    expect(githubBadgeStyle.borderRadius).toBe('9999px')
    expect(githubBadgeStyle.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
    expect(githubBadgeStyle.paddingInline).toBe('12px')
    expect(githubBadgeStyle.paddingBlock).toBe('8px')
    expect(githubBadgeStyle.iconWidth).toBeGreaterThan(12)
    expect(githubBadgeStyle.iconHeight).toBeGreaterThan(12)
    expect(githubBadgeStyle.iconMaskImage).toContain('data:image/svg+xml')

    const openAiIconFilter = await page
      .locator('.home-hero__actions [class~="icon-[logos--openai-icon]"]')
      .evaluate(element => getComputedStyle(element).filter)
    expect(openAiIconFilter).not.toBe('none')

    const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth)
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(scrollWidth).toBeLessThanOrEqual(viewportWidth + 1)
  })

  test('English homepage keeps the semantic platform icon order', async ({ page }) => {
    await setStoredLocale(page, 'en')
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(baseURL, {
      waitUntil: 'networkidle',
    })

    const platformLabels = await page.locator('.home-hero__platform-icon')
      .evaluateAll(elements => elements.map(element => element.getAttribute('aria-label')))
    expect(platformLabels).toEqual(['Web', 'Mini app', 'Android', 'iOS', 'HarmonyOS', 'React Native', 'Lynx'])
    const platformHrefs = await page.locator('.home-hero__platform-icon')
      .evaluateAll(elements => elements.map(element => element.getAttribute('href')))
    expect(platformHrefs).toEqual([
      '/docs/intro',
      '/docs/quick-start/native/install',
      '/docs/quick-start/frameworks/uni-app-x',
      '/docs/quick-start/frameworks/uni-app-x',
      '/docs/quick-start/frameworks/uni-app-x',
      '/docs/quick-start/react-native-expo',
      '/docs/quick-start/frameworks/lynx',
    ])

    await expect(page.locator('.home-support__anchor-label')).toHaveText('Tailwind CSS')
    await expect(page.locator('.home-support__anchor-values strong')).toHaveText(['@source'])
    await expect(page.locator('.home-support__track dt')).toHaveText(['Frameworks', 'Builders', 'Runtime'])
    await expect(page.locator('.home-support__track').nth(0).locator('dd strong')).toHaveText(['uni-app', 'Taro', 'React Native', 'Lynx'])
    await expect(page.locator('.home-support__track').nth(1).locator('dd strong')).toHaveText(['Webpack', 'Vite', 'Metro', 'Rspeedy'])
    await expect(page.locator('.home-support__track').nth(2).locator('dd strong')).toHaveText(['merge', 'cva', 'variants'])
  })

  test('desktop support tracks keep an asymmetric readable layout', async ({ page }) => {
    await setStoredLocale(page, 'zh-cn')
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(baseURL, {
      waitUntil: 'networkidle',
    })

    const support = page.locator('.home-support')
    const anchor = support.locator('.home-support__anchor')
    const tracks = support.locator('.home-support__tracks')

    await expect(support).toBeVisible()
    await expect(anchor.locator('.home-support__anchor-label')).toHaveText('Tailwind CSS')
    await expect(anchor.locator('.home-support__anchor-values strong')).toHaveText(['@source'])
    await expect(tracks.locator('.home-support__track')).toHaveCount(3)
    await expect(tracks.locator('dt')).toHaveText(['框架', '构建器', '运行时'])
    await expect(support.locator('nav')).toHaveCount(0)
    await expect(support.locator('.home-facts__item, .home-facts__routes')).toHaveCount(0)

    const geometry = await support.evaluate((element) => {
      const anchorElement = element.querySelector<HTMLElement>('.home-support__anchor')!
      const tracksElement = element.querySelector<HTMLElement>('.home-support__tracks')!
      const supportRect = element.getBoundingClientRect()
      const anchorRect = anchorElement.getBoundingClientRect()
      const tracksRect = tracksElement.getBoundingClientRect()
      return {
        anchorHeight: anchorRect.height,
        anchorRatio: anchorRect.width / supportRect.width,
        anchorRight: anchorRect.right,
        supportLeft: supportRect.left,
        supportRight: supportRect.right,
        tracksHeight: tracksRect.height,
        tracksLeft: tracksRect.left,
      }
    })

    expect(geometry.anchorRatio).toBeGreaterThan(0.31)
    expect(geometry.anchorRatio).toBeLessThan(0.37)
    expect(Math.abs(geometry.anchorHeight - geometry.tracksHeight)).toBeLessThanOrEqual(1)
    expect(Math.abs(geometry.anchorRight - geometry.tracksLeft)).toBeLessThanOrEqual(1)
    expect(geometry.supportLeft).toBeGreaterThanOrEqual(0)
    expect(geometry.supportRight).toBeLessThanOrEqual(1440)

    await page.setViewportSize({ width: 1280, height: 720 })
    await expect.poll(async () => support.evaluate(element => element.getBoundingClientRect().top)).toBeLessThan(720)
  })

  test('GitHub badge requests the organization repository and ignores the previous owner cache', async ({ page }) => {
    await setStoredLocale(page, 'zh-cn')
    await page.addInitScript(() => {
      window.sessionStorage.setItem('weapp-tailwindcss:github-stars:sonofmagic/weapp-tailwindcss', JSON.stringify({
        value: 1234,
        expires: Date.now() + 60_000,
      }))
    })
    const endpoint = 'https://img.shields.io/github/stars/weapp-tailwindcss/weapp-tailwindcss.json'
    await page.route(endpoint, route => route.fulfill({ json: { message: '2.5k' } }))
    const request = page.waitForRequest(endpoint)
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
    await request

    const badge = page.locator('.ui-homepage-github-badge')
    await expect(badge).toHaveAttribute('href', 'https://github.com/weapp-tailwindcss/weapp-tailwindcss')
    await expect(badge).toHaveAttribute('aria-label', 'Star weapp-tailwindcss/weapp-tailwindcss on GitHub')
    await expect(badge).toContainText('2.5k')
  })

  test('support signals retain cached data and UI switch behavior', async ({ page }) => {
    await setStoredLocale(page, 'zh-cn')
    await page.addInitScript(({ githubKey, npmKey, settingsKey }) => {
      const expires = Date.now() + 60_000
      if (!window.sessionStorage.getItem(githubKey)) {
        window.sessionStorage.setItem(githubKey, JSON.stringify({ value: 1234, expires }))
      }
      if (!window.sessionStorage.getItem(npmKey)) {
        window.sessionStorage.setItem(npmKey, JSON.stringify({
          value: { version: '9.9.9', publishedAt: null },
          expires,
        }))
      }
      if (!window.localStorage.getItem(settingsKey)) {
        window.localStorage.setItem(settingsKey, JSON.stringify({
          homepage: { githubBadge: true, npmVersionBadge: true },
        }))
      }
    }, {
      githubKey: githubStarsCacheKey,
      npmKey: npmVersionCacheKey,
      settingsKey: uiStorageKey,
    })
    await page.goto(baseURL, { waitUntil: 'networkidle' })

    await expect(page.locator('.ui-homepage-github-badge')).toContainText('1.2k')
    await expect(page.locator('.ui-homepage-npm-version-badge')).toContainText('v9.9.9')

    await page.evaluate((settingsKey) => {
      const stored = JSON.parse(window.localStorage.getItem(settingsKey) ?? '{}') as {
        homepage?: Record<string, unknown>
      }
      window.localStorage.setItem(settingsKey, JSON.stringify({
        ...stored,
        homepage: {
          ...stored.homepage,
          githubBadge: false,
          npmVersionBadge: false,
        },
      }))
    }, uiStorageKey)
    await page.reload({ waitUntil: 'networkidle' })

    await expect(page.locator('.ui-homepage-github-badge')).toHaveCount(0)
    await expect(page.locator('.ui-homepage-npm-version-badge')).toHaveCount(0)
    await expect(page.locator('.home-support__track')).toHaveCount(3)
  })

  test('React Native and Lynx platform links reach their localized documentation', async ({ page }) => {
    await setStoredLocale(page, 'zh-cn')
    await page.goto(baseURL, { waitUntil: 'networkidle' })

    await page.getByRole('link', { name: 'React Native' }).click()
    await expect(page).toHaveURL(/\/zh-cn\/docs\/quick-start\/react-native-expo\/?$/)

    await page.goto(baseURL, { waitUntil: 'networkidle' })
    await page.getByRole('link', { name: 'Lynx' }).click()
    await expect(page).toHaveURL(/\/zh-cn\/docs\/quick-start\/frameworks\/lynx\/?$/)

    await page.evaluate(key => window.localStorage.setItem(key, 'en'), localeStorageKey)
    await page.goto(baseURL, { waitUntil: 'networkidle' })
    await page.getByRole('link', { name: 'React Native' }).click()
    await expect(page).toHaveURL(/\/docs\/quick-start\/react-native-expo\/?$/)

    await page.goto(baseURL, { waitUntil: 'networkidle' })
    await page.getByRole('link', { name: 'Lynx' }).click()
    await expect(page).toHaveURL(/\/docs\/quick-start\/frameworks\/lynx\/?$/)
  })

  test('primary CTA remains readable in light mode', async ({ page }) => {
    await setStoredLocale(page, 'zh-cn')
    await page.addInitScript(() => {
      window.localStorage.setItem('theme', 'light')
    })
    await page.goto(baseURL, {
      waitUntil: 'networkidle',
    })

    const primaryCta = page.locator('.home-hero__actions .home-cta')
    const colors = await primaryCta.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        backgroundColor: style.backgroundColor,
        color: style.color,
      }
    })

    expect(colors.backgroundColor).toBe('rgb(2, 132, 199)')
    expect(colors.color).toBe('rgb(255, 255, 255)')
  })

  test('Lynx logo remains visible in dark mode', async ({ page }) => {
    await setStoredLocale(page, 'zh-cn')
    await page.addInitScript(() => {
      window.localStorage.setItem('theme', 'dark')
    })
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' })

    const lynxLogo = page.locator('.home-hero__platform-logo--lynx')
    await expect(lynxLogo).toBeVisible()
    await expect.poll(async () => lynxLogo.evaluate(element => getComputedStyle(element).filter)).toContain('invert(1)')
  })

  test('mobile hero actions fit without horizontal overflow', async ({ page }) => {
    await setStoredLocale(page, 'zh-cn')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(baseURL, {
      waitUntil: 'networkidle',
    })

    await expect(page.locator('.home-hero__platform-strip')).toBeHidden()
    const primaryCta = page.locator('.home-hero__actions .home-cta')
    await expect(primaryCta).toBeVisible()
    await expect(primaryCta).toHaveText(/开始接入/)
    await expect(primaryCta).toHaveAttribute('href', '/zh-cn/docs/quick-start/install')

    const actionBoxes = await page.locator('.home-hero__actions a').evaluateAll(elements => elements.map((element) => {
      const rect = element.getBoundingClientRect()
      return {
        width: rect.width,
        height: rect.height,
        left: rect.left,
        right: rect.right,
      }
    }))

    expect(actionBoxes).toHaveLength(3)
    for (const box of actionBoxes) {
      expect(box.height).toBeGreaterThanOrEqual(40)
      expect(box.left).toBeGreaterThanOrEqual(0)
      expect(box.right).toBeLessThanOrEqual(390)
    }

    const supportGeometry = await page.locator('.home-support').evaluate((element) => {
      const anchorRect = element.querySelector<HTMLElement>('.home-support__anchor')!.getBoundingClientRect()
      const tracksRect = element.querySelector<HTMLElement>('.home-support__tracks')!.getBoundingClientRect()
      const trackRects = Array.from(element.querySelectorAll<HTMLElement>('.home-support__track'))
        .map((track) => {
          const rect = track.getBoundingClientRect()
          return { left: rect.left, right: rect.right }
        })
      return {
        anchorBottom: anchorRect.bottom,
        tracksTop: tracksRect.top,
        trackRects,
      }
    })

    expect(Math.abs(supportGeometry.anchorBottom - supportGeometry.tracksTop)).toBeLessThanOrEqual(1)
    expect(supportGeometry.trackRects).toHaveLength(3)
    for (const box of supportGeometry.trackRects) {
      expect(box.left).toBeGreaterThanOrEqual(0)
      expect(box.right).toBeLessThanOrEqual(390)
    }

    const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth)
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(scrollWidth).toBeLessThanOrEqual(viewportWidth + 1)
  })
})

test.describe('homepage locale detection', () => {
  test('keeps English browsers on the default root locale', async ({ page }) => {
    await page.addInitScript((key) => {
      window.localStorage.removeItem(key)
    }, localeStorageKey)
    await setNavigatorLanguages(page, ['en-US', 'en'])

    await page.goto(baseURL, {
      waitUntil: 'domcontentloaded',
    })

    await expect(page).toHaveURL(/https?:\/\/[^/]+\/?$/)
    await expect(page.locator('.home-hero__actions .home-cta')).toHaveText(/Start setup/)
    await expect(page.locator('html')).toHaveAttribute('lang', /en/i)
  })

  test('redirects to Chinese when navigator languages include Chinese', async ({ page }) => {
    await page.addInitScript((key) => {
      window.localStorage.removeItem(key)
    }, localeStorageKey)
    await setNavigatorLanguages(page, ['en-US', 'en', 'zh-CN'])

    await page.goto(baseURL, {
      waitUntil: 'domcontentloaded',
    })

    await expect(page).toHaveURL(/\/zh-cn\/?$/)
    await expect(page.locator('.home-hero__actions .home-cta')).toHaveText(/开始接入/)
    await expect(page.locator('html')).toHaveAttribute('lang', /zh/i)
  })

  test('keeps non-Chinese browser languages on English', async ({ page }) => {
    await page.addInitScript((key) => {
      window.localStorage.removeItem(key)
    }, localeStorageKey)
    await setNavigatorLanguages(page, ['fr-FR', 'fr'])

    await page.goto(baseURL, {
      waitUntil: 'domcontentloaded',
    })

    await expect(page).toHaveURL(/https?:\/\/[^/]+\/?$/)
    await expect(page.locator('.home-hero__actions .home-cta')).toHaveText(/Start setup/)
    await expect(page.locator('html')).toHaveAttribute('lang', /en/i)
  })

  test('respects stored English preference over a Chinese browser locale', async ({ page }) => {
    await setStoredLocale(page, 'en')
    await setNavigatorLanguages(page, ['zh-CN', 'zh'])

    await page.goto(baseURL, {
      waitUntil: 'domcontentloaded',
    })

    await expect(page).toHaveURL(/https?:\/\/[^/]+\/?$/)
    await expect(page.locator('.home-hero__actions .home-cta')).toHaveText(/Start setup/)
  })

  test('respects stored Chinese preference on the root page', async ({ page }) => {
    await setStoredLocale(page, 'zh-cn')

    await page.goto(baseURL, {
      waitUntil: 'domcontentloaded',
    })

    await expect(page).toHaveURL(/\/zh-cn\/?$/)
    await expect(page.locator('.home-hero__actions .home-cta')).toHaveText(/开始接入/)
  })

  test('switches from English to Chinese and persists the selection', async ({ page }) => {
    await setStoredLocale(page, 'en')

    await page.goto(baseURL, {
      waitUntil: 'domcontentloaded',
    })

    const localeDropdown = page.locator('.navbar__item.dropdown').filter({ hasText: 'English' })
    await expect(localeDropdown).toHaveCount(1)
    await localeDropdown.hover()

    const chineseLink = localeDropdown.locator('a[href="/zh-cn/"]')
    await expect(chineseLink).toHaveText('中文')
    await chineseLink.click()

    await expect(page).toHaveURL(/\/zh-cn\/?$/)
    await expect(page.locator('.home-hero__actions .home-cta')).toHaveText(/开始接入/)
    await expect(page.locator('html')).toHaveAttribute('lang', /zh/i)

    const chineseLocaleDropdown = page.locator('.navbar__item.dropdown').filter({ hasText: '中文' })
    await expect(chineseLocaleDropdown).toHaveCount(1)
    await chineseLocaleDropdown.hover()
    await expect(chineseLocaleDropdown.locator('a[href="/"]')).toHaveText('English')

    await page.goto(baseURL, {
      waitUntil: 'domcontentloaded',
    })
    await expect(page).toHaveURL(/\/zh-cn\/?$/)
    await expect(page.locator('html')).toHaveAttribute('lang', /zh/i)
  })

  test('keeps repeated locale switches on canonical paths', async ({ page }) => {
    await setStoredLocale(page, 'zh-cn')
    await page.goto(new URL('/zh-cn/docs/quick-start/install', baseURL).toString(), {
      waitUntil: 'domcontentloaded',
    })

    for (let index = 0; index < 3; index += 1) {
      await page.locator('.navbar__item.dropdown').filter({ hasText: '中文' }).hover()
      const englishLink = page.locator('.navbar__item.dropdown a[lang^="en"]')
      await expect(englishLink).toHaveAttribute('href', '/docs/quick-start/install')
      await englishLink.click()
      await expect(page).toHaveURL(/\/docs\/quick-start\/install$/)

      await page.locator('.navbar__item.dropdown').filter({ hasText: 'English' }).hover()
      const chineseLink = page.locator('.navbar__item.dropdown a[lang^="zh"]')
      await expect(chineseLink).toHaveAttribute('href', '/zh-cn/docs/quick-start/install')
      await chineseLink.click()
      await expect(page).toHaveURL(/\/zh-cn\/docs\/quick-start\/install$/)
      expect(new URL(page.url()).pathname).not.toMatch(/^\/zh-cn\/zh-cn(?:\/|$)/)
    }
  })

  test('recovers repeated Chinese prefixes to a canonical page', async ({ page }) => {
    await page.goto(new URL('/zh-cn/zh-cn/zh-cn', baseURL).toString(), {
      waitUntil: 'domcontentloaded',
    })

    await expect(page).toHaveURL(/\/zh-cn\/?$/)
    await expect(page.locator('html')).toHaveAttribute('lang', /zh/i)
    await expect(page.locator('h1')).toContainText('weapp-tailwindcss')
  })

  test('redirects legacy English prefixes to unprefixed canonical paths', async ({ page }) => {
    await setStoredLocale(page, 'en')
    await page.goto(new URL('/en/en/docs/intro', baseURL).toString(), {
      waitUntil: 'domcontentloaded',
    })

    await expect(page).toHaveURL(/\/docs\/intro$/)
    await expect(page.locator('html')).toHaveAttribute('lang', /en/i)
    await expect(page.locator('h1')).toHaveText('Introduction')
  })

  test('keeps the desktop locale switcher icon and label on one line', async ({ page }) => {
    await setStoredLocale(page, 'zh-cn')

    for (const width of [1440, 1100]) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto(baseURL, {
        waitUntil: 'domcontentloaded',
      })

      const localeLink = page.locator('.navbar__item.dropdown > .navbar__link').filter({ hasText: '中文' })
      await expect(localeLink).toHaveCount(1)
      await expect(localeLink).toHaveCSS('display', /^(?:inline-)?flex$/)
      await expect(localeLink).toHaveCSS('white-space', 'nowrap')

      const alignment = await localeLink.evaluate((link) => {
        const dropdown = link.parentElement
        const navbarItems = link.closest('.navbar__items')
        const icon = link.querySelector('svg')
        const labelNode = Array.from(link.childNodes).find(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
        if (!dropdown || !navbarItems || !icon || !labelNode) {
          return null
        }

        const labelRange = document.createRange()
        labelRange.selectNode(labelNode)
        const dropdownRect = dropdown.getBoundingClientRect()
        const navbarItemsRect = navbarItems.getBoundingClientRect()
        const linkRect = link.getBoundingClientRect()
        const iconRect = icon.getBoundingClientRect()
        const labelRect = labelRange.getBoundingClientRect()
        const navbarItemsCenter = navbarItemsRect.top + navbarItemsRect.height / 2
        const rightItemCenterOffsets = Array.from(navbarItems.children)
          .filter(element => getComputedStyle(element).display !== 'none')
          .map((element) => {
            const rect = element.getBoundingClientRect()
            return Math.abs((rect.top + rect.height / 2) - navbarItemsCenter)
          })

        return {
          rightItemCenterOffsets,
          dropdownCenterOffset: Math.abs(
            (dropdownRect.top + dropdownRect.height / 2)
            - navbarItemsCenter,
          ),
          linkCenterOffset: Math.abs(
            (linkRect.top + linkRect.height / 2)
            - navbarItemsCenter,
          ),
          centerOffset: Math.abs(
            (iconRect.top + iconRect.height / 2) - (labelRect.top + labelRect.height / 2),
          ),
          navbarOverflows: document.querySelector('.navbar__inner')!.scrollWidth
            > document.querySelector('.navbar__inner')!.clientWidth,
        }
      })

      expect(alignment).not.toBeNull()
      expect(Math.max(...alignment!.rightItemCenterOffsets)).toBeLessThanOrEqual(0.5)
      expect(alignment!.dropdownCenterOffset).toBeLessThanOrEqual(0.5)
      expect(alignment!.linkCenterOffset).toBeLessThanOrEqual(0.5)
      expect(alignment!.centerOffset).toBeLessThanOrEqual(2)
      expect(alignment!.navbarOverflows).toBe(false)
    }
  })

  test('serves English docs and blog samples on unprefixed pages', async ({ page }) => {
    await page.goto(new URL('/docs/intro', baseURL).toString(), {
      waitUntil: 'domcontentloaded',
    })
    await expect(page.locator('h1')).toHaveText('Introduction')
    await expect(page.locator('html')).toHaveAttribute('lang', /en/i)
    await expect(page.locator('head meta[http-equiv="Content-Language"]')).toHaveAttribute('content', /en/i)

    await page.goto(new URL('/blog/2025/9/v4.3-release', baseURL).toString(), {
      waitUntil: 'domcontentloaded',
    })
    await expect(page.locator('h1')).toContainText('4.3.0')
    await expect(page.locator('html')).toHaveAttribute('lang', /en/i)
  })
})

test.describe('mobile navbar sidebar', () => {
  test.use(mobileUse(devices['iPhone 12']))

  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Only run on chromium to keep the suite fast',
  )

  test('keeps the document menu visible and navigable', async ({ page }) => {
    await setStoredLocale(page, 'zh-cn')
    await page.goto(new URL('/zh-cn/docs/intro', baseURL).toString(), {
      waitUntil: 'networkidle',
    })

    await page.locator('.navbar__toggle').tap()

    const sidebar = page.locator('.navbar-sidebar')
    const activePanel = sidebar.locator('.navbar-sidebar__item:not([inert])')
    const backButton = activePanel.getByRole('button', { name: '回到主菜单' })

    await expect(sidebar).toBeVisible()
    await expect(activePanel.getByRole('link', { name: '简介', exact: true })).toBeVisible()
    await expect(backButton).toBeVisible()

    await expect.poll(() => backButton.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      return target === element || element.contains(target)
    })).toBe(true)

    await backButton.tap()
    await expect(sidebar.getByRole('link', { name: '指南', exact: true })).toBeVisible()

    await sidebar.getByRole('button', { name: '关闭导航栏' }).tap()
    await expect(sidebar).toBeHidden()
  })
})

test.describe('color mode transition strategy', () => {
  test('desktop uses the fade preset and degrades pointerless activation', async ({ browserName, page }) => {
    test.skip(browserName !== 'chromium', 'The native View Transition path is verified in Chromium')

    await setStoredLocale(page, 'zh-cn')
    await page.setViewportSize({ width: 1440, height: 900 })
    await instrumentThemeTransitions(page)
    await page.goto(baseURL, {
      waitUntil: 'networkidle',
    })

    const html = page.locator('html')
    const toggle = page.locator('button[aria-label*="浅色/暗黑模式"]:visible')

    expect(await page.evaluate(() => typeof document.startViewTransition)).toBe('function')

    await toggle.evaluate((element) => {
      const button = element as HTMLButtonElement
      button.click()
      button.click()
    })

    await expect(html).toHaveAttribute('data-theme', 'light')
    await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme-transition'))).toBeNull()
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem('theme'))).toBe('light')

    expect(await page.evaluate(() => ({
      animations: window.__themeTransitionAnimations ?? [],
      calls: window.__themeTransitionCalls ?? 0,
    }))).toEqual({
      animations: [],
      calls: 0,
    })

    await toggle.focus()
    await page.keyboard.press('Enter')

    await expect(html).toHaveAttribute('data-theme', 'dark')
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem('theme'))).toBe('dark')
    expect(await page.evaluate(() => window.__themeTransitionCalls ?? 0)).toBe(0)

    const toggleBox = await toggle.boundingBox()
    expect(toggleBox).not.toBeNull()
    if (!toggleBox) {
      return
    }

    await page.mouse.click(toggleBox.x + 2, toggleBox.y + 2)

    await expect(html).toHaveAttribute('data-theme', 'light')
    await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme-transition'))).toBeNull()
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem('theme'))).toBe('light')

    await page.mouse.click(toggleBox.x + toggleBox.width - 2, toggleBox.y + toggleBox.height - 2)

    await expect(html).toHaveAttribute('data-theme', 'dark')
    await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme-transition'))).toBeNull()
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem('theme'))).toBe('dark')

    const transitionState = await page.evaluate(() => ({
      animations: window.__themeTransitionAnimations ?? [],
      calls: window.__themeTransitionCalls ?? 0,
      clicks: window.__themeTransitionClicks ?? [],
      liveAnimations: document.getAnimations().filter((animation) => {
        const pseudoElement = animation.effect instanceof KeyframeEffect
          ? animation.effect.pseudoElement
          : null
        return pseudoElement?.includes('view-transition') && animation.playState !== 'idle'
      }).length,
    }))

    expect(transitionState.clicks.slice(0, 3)).toEqual([
      { clientX: 0, clientY: 0 },
      { clientX: 0, clientY: 0 },
      { clientX: 0, clientY: 0 },
    ])
    const pointerClicks = transitionState.clicks.slice(3)
    expect(pointerClicks).toHaveLength(2)
    expect(transitionState.calls).toBe(2)
    expect(transitionState.liveAnimations).toBe(0)
    expect(transitionState.animations).toHaveLength(2)

    const [fromDark, toDark] = transitionState.animations
    expect(fromDark).toMatchObject({
      duration: 240,
      easing: 'ease-in-out',
      fill: 'forwards',
      opacity: ['1', '0'],
      pseudoElement: '::view-transition-old(root)',
    })
    expect(fromDark.clipPath).toEqual(['undefined', 'undefined'])
    expect(fromDark.transform).toEqual(['undefined', 'undefined'])

    expect(toDark).toMatchObject({
      duration: 240,
      easing: 'ease-in-out',
      fill: 'forwards',
      opacity: ['0', '1'],
      pseudoElement: '::view-transition-new(root)',
    })
    expect(toDark.clipPath).toEqual(['undefined', 'undefined'])
    expect(toDark.transform).toEqual(['undefined', 'undefined'])
  })

  test('desktop releases theme transition animations across repeated toggles', async ({ browserName, page }) => {
    test.skip(browserName !== 'chromium', 'The native View Transition path is verified in Chromium')

    await setStoredLocale(page, 'zh-cn')
    await page.setViewportSize({ width: 1440, height: 900 })
    await instrumentThemeTransitions(page)
    await page.goto(baseURL, {
      waitUntil: 'networkidle',
    })

    const html = page.locator('html')
    const toggle = page.locator('button[aria-label*="浅色/暗黑模式"]:visible')

    for (let index = 0; index < 20; index++) {
      const expectedTheme = index % 2 === 0 ? 'light' : 'dark'
      await toggle.click()
      await expect(html).toHaveAttribute('data-theme', expectedTheme)
      await expect.poll(() => page.evaluate(() => window.localStorage.getItem('theme'))).toBe(expectedTheme)
      await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme-transition'))).toBeNull()
      await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => {
        const pseudoElement = animation.effect instanceof KeyframeEffect
          ? animation.effect.pseudoElement
          : null
        return pseudoElement?.includes('view-transition') && animation.playState !== 'idle'
      }).length)).toBe(0)
    }

    expect(await page.evaluate(() => ({
      animations: window.__themeTransitionAnimations?.length ?? 0,
      calls: window.__themeTransitionCalls ?? 0,
      presetAttribute: document.documentElement.getAttribute('data-theme-transition-preset'),
      transitionAttribute: document.documentElement.getAttribute('data-theme-transition'),
    }))).toEqual({
      animations: 20,
      calls: 20,
      presetAttribute: null,
      transitionAttribute: null,
    })
  })

  test('reduced motion skips view transitions for theme changes', async ({ page }) => {
    await setStoredLocale(page, 'zh-cn')
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(() => {
      window.localStorage.setItem('theme', 'dark')
      Object.defineProperty(document, 'startViewTransition', {
        configurable: true,
        value(callback: () => void | Promise<void>) {
          window.__themeTransitionCalls = (window.__themeTransitionCalls ?? 0) + 1
          const done = Promise.resolve(callback())
          return {
            ready: Promise.resolve(),
            finished: done,
            updateCallbackDone: done,
          }
        },
      })
    })
    await page.goto(baseURL, {
      waitUntil: 'networkidle',
    })

    await page.locator('button[aria-label*="浅色/暗黑模式"]:visible').click()

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    const calls = await page.evaluate(() => window.__themeTransitionCalls ?? 0)
    expect(calls).toBe(0)
  })

  test('missing View Transition API falls back to a direct theme change', async ({ page }) => {
    await setStoredLocale(page, 'zh-cn')
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.addInitScript(() => {
      window.localStorage.setItem('theme', 'dark')
      Object.defineProperty(document, 'startViewTransition', {
        configurable: true,
        value: undefined,
      })
    })
    await page.goto(baseURL, {
      waitUntil: 'networkidle',
    })

    await page.locator('button[aria-label*="浅色/暗黑模式"]:visible').click()

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem('theme'))).toBe('light')
  })

  test('non fine-pointer environments skip view transitions for theme changes', async ({ page }) => {
    await setStoredLocale(page, 'zh-cn')
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.addInitScript(() => {
      window.localStorage.setItem('theme', 'dark')
      const nativeMatchMedia = window.matchMedia.bind(window)
      window.matchMedia = (query: string) => {
        if (query.includes('hover: hover') || query.includes('pointer: fine')) {
          return {
            addEventListener: () => {},
            addListener: () => {},
            dispatchEvent: () => false,
            matches: false,
            media: query,
            onchange: null,
            removeEventListener: () => {},
            removeListener: () => {},
          }
        }
        return nativeMatchMedia(query)
      }
      Object.defineProperty(document, 'startViewTransition', {
        configurable: true,
        value(callback: () => void | Promise<void>) {
          window.__themeTransitionCalls = (window.__themeTransitionCalls ?? 0) + 1
          const done = Promise.resolve(callback())
          return {
            ready: Promise.resolve(),
            finished: done,
            updateCallbackDone: done,
          }
        },
      })
    })
    await page.goto(baseURL, {
      waitUntil: 'networkidle',
    })

    await page.locator('button[aria-label*="浅色/暗黑模式"]:visible').click()

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    const calls = await page.evaluate(() => window.__themeTransitionCalls ?? 0)
    expect(calls).toBe(0)
  })
})

for (const viewport of viewports) {
  test.describe(`${viewport.name} viewport`, () => {
    test.use(viewport.use)

    if (viewport.onlyBrowser) {
      test.skip(
        ({ browserName }) => browserName !== viewport.onlyBrowser,
        `Only run on ${viewport.onlyBrowser} to keep the suite fast`,
      )
    }

    for (const route of routes) {
      test(`${viewport.name} ${route} screenshot`, async ({ page }) => {
        const url = new URL(route, baseURL)
        await page.goto(url.toString(), {
          waitUntil: 'networkidle',
        })

        await expect(page).toHaveScreenshot({
          fullPage: true,
        })
      })
    }
  })
}
