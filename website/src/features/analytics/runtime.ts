import { deploymentOrigins } from '../../../config/deploymentTarget'

interface AnalyticsGtag {
  (command: 'js', date: Date): void
  (command: 'config', trackingId: string, config: Record<string, unknown>): void
  (command: 'set', field: 'page_path', value: string): void
  (command: 'event', name: 'page_view'): void
}

export interface AnalyticsWindow extends Window {
  dataLayer?: unknown[]
  gtag?: AnalyticsGtag
}

interface RouteLocation {
  pathname: string
  search: string
  hash: string
}

const googleTrackingId = 'G-S81Q4GRTPM'
const baiduTrackingId = '61f3de7065e36044e6d5f201632bc368'

export function isProductionAnalyticsOrigin(origin: string, siteUrl: string): boolean {
  const canonical = new URL(siteUrl)
  return canonical.origin === deploymentOrigins.production && origin === canonical.origin
}

/** 统计资源和事件共用部署来源边界，生产产物可安全复用于预览及本地验证。 */
export function initializeAnalytics(browser: AnalyticsWindow, siteUrl: string) {
  if (!isProductionAnalyticsOrigin(browser.location.origin, siteUrl)) {
    return undefined
  }

  const document = browser.document
  browser.dataLayer ??= []
  browser.gtag ??= (...args: unknown[]) => {
    browser.dataLayer!.push(args)
  }

  function preconnect(id: string, href: string) {
    if (!document.getElementById(id)) {
      const link = document.createElement('link')
      link.id = id
      link.rel = 'preconnect'
      link.href = href
      document.head.append(link)
    }
  }

  function script(id: string, src: string, initialize?: () => void) {
    if (!document.getElementById(id)) {
      const element = document.createElement('script')
      element.id = id
      element.src = src
      element.async = true
      // DOM 标识跨模块重复评估保持幂等，避免重复初始化及首屏 pageview。
      initialize?.()
      document.head.append(element)
    }
  }

  preconnect('analytics-google-connection', 'https://www.google-analytics.com')
  preconnect('analytics-gtag-connection', 'https://www.googletagmanager.com')
  preconnect('analytics-baidu-connection', 'https://hm.baidu.com')
  script('analytics-gtag', `https://www.googletagmanager.com/gtag/js?id=${googleTrackingId}`, () => {
    browser.gtag!('js', new Date())
    browser.gtag!('config', googleTrackingId, {})
  })
  script('analytics-baidu', `https://hm.baidu.com/hm.js?${baiduTrackingId}`)

  return {
    onRouteDidUpdate(location: RouteLocation, previousLocation: RouteLocation | null) {
      if (previousLocation && (
        location.pathname !== previousLocation.pathname
        || location.search !== previousLocation.search
        || location.hash !== previousLocation.hash
      )) {
        // 保留 Docusaurus gtag 的下一任务语义，让更新后的页面标题先提交。
        browser.setTimeout(() => {
          browser.gtag!('set', 'page_path', location.pathname + location.search + location.hash)
          browser.gtag!('event', 'page_view')
        })
      }
    },
  }
}
