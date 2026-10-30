import type { Page } from '@playwright/test'
import type { AnalyticsFixtureWindow } from './helpers/analytics-fixture'
import { runInNewContext } from 'node:vm'
import { expect, test } from '@playwright/test'
import { createAnalyticsFixture, googleFixtureScript } from './helpers/analytics-fixture'

const analyticsHosts = new Set(['www.googletagmanager.com', 'www.google-analytics.com', 'hm.baidu.com'])
let fixture: Awaited<ReturnType<typeof createAnalyticsFixture>>

test.beforeAll(async () => {
  fixture = await createAnalyticsFixture()
})

async function installFixture(page: Page, html: string) {
  const requests: string[] = []
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    requests.push(url.href)
    if (url.hostname === 'business.example.test') {
      await route.fulfill({ contentType: 'text/javascript', body: 'window.analyticsFixtureBusinessReady = true;' })
    }
    else if (url.hostname === 'www.googletagmanager.com') {
      await route.fulfill({ contentType: 'text/javascript', body: googleFixtureScript })
    }
    else if (url.hostname === 'hm.baidu.com' && url.pathname === '/hm.js') {
      await route.fulfill({ contentType: 'text/javascript', body: `fetch('https://hm.baidu.com/hm.gif?si=61f3de7065e36044e6d5f201632bc368', {mode: 'no-cors'});` })
    }
    else if (analyticsHosts.has(url.hostname)) {
      await route.fulfill({ status: 204 })
    }
    else {
      await route.fulfill({ contentType: 'text/html', body: html })
    }
  })
  return requests
}

async function updateRoute(page: Page, next: string, previous: string | null) {
  await page.evaluate(({ next, previous }) => {
    const toLocation = (value: string) => {
      const url = new URL(value, location.href)
      return { pathname: url.pathname, search: url.search, hash: url.hash, state: null, key: 'fixture' }
    }
    const nextLocation = toLocation(next)
    const previousLocation = previous ? toLocation(previous) : null
    history.pushState({}, '', next)
    for (const module of (window as AnalyticsFixtureWindow).analyticsFixtureModules) {
      const dispatcher = module as typeof module & { default?: typeof module }
      const onRouteDidUpdate = dispatcher.default?.onRouteDidUpdate ?? dispatcher.onRouteDidUpdate
      onRouteDidUpdate?.({ location: nextLocation, previousLocation })
    }
    document.title = '路由更新后的标题'
  }, { next, previous })
  // 只跨过路由回调的下一任务，不以固定等待代替资源就绪。
  await page.evaluate(() => new Promise<void>(resolve => setTimeout(resolve)))
}

test('相同生产产物在非 canonical origin 不预连接、不加载或上报统计，保留普通业务脚本', async ({ page }) => {
  const requests = await installFixture(page, fixture.html)
  const origins = [
    'http://127.0.0.1:43210',
    'http://localhost:43210',
    'https://preview.tw.weapp.dev',
    'https://tw.weapp.dev:8443',
    'https://tw.weapp.dev.example.test',
  ]
  for (const origin of origins) {
    requests.length = 0
    await page.goto(`${origin}/docs/analytics-fixture`, { waitUntil: 'load' })
    await updateRoute(page, '/docs/analytics-next?mode=preview#heading', '/docs/analytics-fixture')
    expect(requests.filter(url => analyticsHosts.has(new URL(url).hostname)), origin).toEqual([])
    const state = await page.evaluate(() => ({
      callable: typeof (window as AnalyticsFixtureWindow).gtag,
      businessReady: (window as AnalyticsFixtureWindow).analyticsFixtureBusinessReady,
      preconnects: Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="preconnect"]')).map(link => new URL(link.href).hostname),
      scripts: Array.from(document.scripts).filter(script => script.src).map(script => new URL(script.src).hostname),
      queue: (window as AnalyticsFixtureWindow).dataLayer.map(args => Array.from(args)),
    }))
    expect(state.callable).toBe('function')
    expect(state.businessReady).toBe(true)
    expect(state.preconnects.filter(host => analyticsHosts.has(host))).toEqual([])
    expect(state.scripts.filter(host => analyticsHosts.has(host))).toEqual([])
    expect(state.queue).toEqual([])
  }
})

test('canonical origin 保留初始 config 与下一任务 SPA page_path、page_view 语义', async ({ page }) => {
  const requests = await installFixture(page, fixture.html)
  const origin = new URL(fixture.url).origin
  const initialPath = '/docs/analytics-fixture?initial=1#intro'
  await page.goto(`${origin}${initialPath}`, { waitUntil: 'load' })
  await expect.poll(() => requests.filter(url => new URL(url).pathname === '/g/collect').length).toBe(1)
  expect(requests).toContain('https://www.googletagmanager.com/gtag/js?id=G-S81Q4GRTPM')
  expect(requests).toContain('https://hm.baidu.com/hm.js?61f3de7065e36044e6d5f201632bc368')
  expect(requests.some(url => new URL(url).pathname === '/hm.gif')).toBe(true)
  expect(await page.evaluate(() => (window as AnalyticsFixtureWindow).analyticsFixtureCalls.map(args => args[0]))).toEqual(['js', 'config'])
  const preconnects = await page.locator('link[rel="preconnect"]').evaluateAll(links => links.map(link => new URL((link as HTMLLinkElement).href).hostname))
  expect(preconnects.filter(host => analyticsHosts.has(host)).sort()).toEqual([...analyticsHosts].sort())
  const callablePreserved = await page.evaluate((runtime) => {
    const gtag = (window as AnalyticsFixtureWindow).gtag
    const script = document.createElement('script')
    script.textContent = runtime
    document.body.append(script)
    return (window as AnalyticsFixtureWindow).gtag === gtag
  }, fixture.runtime)
  expect(callablePreserved).toBe(true)
  expect(await page.locator('script[src]').evaluateAll(scripts => scripts.map(script => new URL((script as HTMLScriptElement).src).hostname).filter(host => host === 'www.googletagmanager.com' || host === 'hm.baidu.com'))).toHaveLength(2)
  expect(await page.locator('link[rel="preconnect"]').count()).toBe(preconnects.length)
  expect(await page.evaluate(() => (window as AnalyticsFixtureWindow).analyticsFixtureCalls.map(args => args[0]))).toEqual(['js', 'config'])

  await updateRoute(page, initialPath, null)
  await updateRoute(page, initialPath, initialPath)
  expect(requests.filter(url => new URL(url).pathname === '/g/collect')).toHaveLength(1)
  const changedPaths = ['/docs/analytics-next', '/docs/analytics-next?query=1', '/docs/analytics-next?query=1#heading']
  let previous = initialPath
  for (const next of changedPaths) {
    await updateRoute(page, next, previous)
    previous = next
  }
  await expect.poll(() => requests.filter(url => new URL(url).pathname === '/g/collect').length).toBe(4)
  const pageviews = requests.filter(url => new URL(url).pathname === '/g/collect').map(url => new URL(url).searchParams)
  expect(pageviews.map(params => params.get('path'))).toEqual([initialPath, ...changedPaths])
  expect(pageviews.slice(1).map(params => params.get('title'))).toEqual(changedPaths.map(() => '路由更新后的标题'))
  expect(await page.evaluate(() => (window as AnalyticsFixtureWindow).analyticsFixtureCalls.slice(2))).toEqual(changedPaths.flatMap(value => [['set', 'page_path', value], ['event', 'page_view']]))
  expect(requests.filter(url => new URL(url).pathname === '/hm.gif')).toHaveLength(1)
})

test('正式 canonical 配置包含路径时按 origin 启用统计，SSR 导入不要求 DOM', async ({ page }) => {
  const configured = await createAnalyticsFixture('https://tw.weapp.dev/docs/configured-path')
  expect(() => runInNewContext(configured.runtime)).not.toThrow()
  const requests = await installFixture(page, configured.html)
  await page.goto('https://tw.weapp.dev/another/path', { waitUntil: 'load' })
  await expect.poll(() => requests.filter(url => new URL(url).pathname === '/g/collect').length).toBe(1)
  expect(requests).toContain('https://www.googletagmanager.com/gtag/js?id=G-S81Q4GRTPM')
})

test('next canonical 配置在正式域与 next 域均不加载或上报统计，保留业务脚本与路由', async ({ page }) => {
  const next = await createAnalyticsFixture('https://next.tw.weapp.dev/docs/configured-path')
  expect(() => runInNewContext(next.runtime)).not.toThrow()
  const requests = await installFixture(page, next.html)
  for (const origin of ['https://tw.weapp.dev', 'https://next.tw.weapp.dev']) {
    requests.length = 0
    await page.goto(`${origin}/docs/analytics-fixture`, { waitUntil: 'load' })
    await updateRoute(page, '/another/path?preview=1#heading', '/docs/analytics-fixture')
    expect(requests.filter(url => analyticsHosts.has(new URL(url).hostname)), origin).toEqual([])
    expect(await page.locator('link[rel="preconnect"]').count()).toBe(0)
    expect(await page.locator('script[src]').evaluateAll(scripts => scripts.map(script => new URL((script as HTMLScriptElement).src).hostname))).toEqual(['business.example.test'])
    expect(await page.evaluate(() => (window as AnalyticsFixtureWindow).analyticsFixtureBusinessReady)).toBe(true)
    expect(await page.evaluate(() => typeof (window as AnalyticsFixtureWindow).gtag)).toBe('function')
    expect(await page.evaluate(() => (window as AnalyticsFixtureWindow).dataLayer)).toEqual([])
  }
})

test('协议边界在无 HSTS 的保留域同样拒绝 HTTP 运行来源', async ({ page }) => {
  const scheme = await createAnalyticsFixture('https://canonical.example.test')
  const requests = await installFixture(page, scheme.html)
  await page.goto('http://canonical.example.test/docs/analytics-fixture', { waitUntil: 'load' })
  await updateRoute(page, '/docs/analytics-next', '/docs/analytics-fixture')
  expect(requests.filter(url => analyticsHosts.has(new URL(url).hostname))).toEqual([])
  expect(await page.locator('link[rel="preconnect"]').count()).toBe(0)
})

test('development 构建在 canonical 来源也不启用线上统计', async ({ page }) => {
  const development = await createAnalyticsFixture(undefined, 'development')
  const requests = await installFixture(page, development.html)
  await page.goto(`${new URL(development.url).origin}/docs/analytics-fixture`, { waitUntil: 'load' })
  expect(requests.filter(url => analyticsHosts.has(new URL(url).hostname))).toEqual([])
  expect(await page.locator('link[rel="preconnect"]').count()).toBe(0)
  expect(await page.evaluate(() => typeof (window as AnalyticsFixtureWindow).gtag)).toBe('function')
})
