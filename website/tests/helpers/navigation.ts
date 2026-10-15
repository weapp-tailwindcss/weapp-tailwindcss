import type { Page, Request, Response } from '@playwright/test'
import { expect } from '@playwright/test'

const reportingOrigins = new Set([
  'https://www.google-analytics.com',
  'https://www.google.com',
])

function isReportingRequest(page: Page, request: Request) {
  if (request.frame() !== page.mainFrame() || request.isNavigationRequest() || request.resourceType() !== 'fetch') {
    return false
  }
  const url = new URL(request.url())
  return reportingOrigins.has(url.origin) && url.pathname === '/g/collect'
}

function assertDocumentResponse(response: Response | null | undefined) {
  if (!response?.ok()) {
    throw new Error(`网站导航失败：HTTP ${response?.status() ?? '无响应'} ${response?.url() ?? ''}`)
  }
}

async function navigate(page: Page, action: () => Promise<Response | null>) {
  const pending = new Set<Request>()
  let generation = 0
  let lastActivity = Date.now()
  let documentRequest: Request | undefined
  let documentResponse: Response | undefined
  let documentFailure: string | undefined

  const onRequest = (request: Request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      // 客户端语言跳转会换文档，旧文档的请求不能阻塞或污染新文档。
      generation += 1
      pending.clear()
      documentRequest = request
      documentResponse = undefined
      documentFailure = undefined
    }
    if (!isReportingRequest(page, request)) {
      pending.add(request)
      lastActivity = Date.now()
    }
  }
  const onResponse = (response: Response) => {
    if (response.request() === documentRequest) {
      documentResponse = response
    }
  }
  const onFinished = (request: Request) => {
    if (pending.delete(request)) {
      lastActivity = Date.now()
    }
  }
  const onFailed = (request: Request) => {
    onFinished(request)
    if (request === documentRequest) {
      documentFailure = request.failure()?.errorText ?? '文档请求失败'
    }
  }

  page.on('request', onRequest)
  page.on('response', onResponse)
  page.on('requestfinished', onFinished)
  page.on('requestfailed', onFailed)
  try {
    assertDocumentResponse(await action())
    await expect.poll(async () => {
      if (documentFailure || (documentResponse && documentResponse.status() >= 400)) {
        return 'failed'
      }
      if (pending.size > 0 || Date.now() - lastActivity < 500) {
        return 'pending'
      }
      const currentGeneration = generation
      let runtimeReady: boolean
      try {
        runtimeReady = await page.evaluate(async () => {
          if (document.readyState === 'loading'
            || document.documentElement.dataset.hasHydrated !== 'true'
            || document.fonts.status !== 'loaded') {
            return false
          }
          await document.fonts.ready
          return true
        })
      }
      catch (error) {
        if (currentGeneration !== generation) {
          return 'pending'
        }
        throw error
      }
      return runtimeReady && currentGeneration === generation && pending.size === 0 && Date.now() - lastActivity >= 500
        ? 'ready'
        : 'pending'
    }, {
      message: '等待最终文档 hydration、字体和非统计资源连续 500ms 空闲',
      intervals: [50, 100],
    }).not.toBe('pending')
    expect(documentFailure, '最终文档请求必须成功').toBeUndefined()
    assertDocumentResponse(documentResponse)
    return documentResponse!
  }
  finally {
    page.off('request', onRequest)
    page.off('response', onResponse)
    page.off('requestfinished', onFinished)
    page.off('requestfailed', onFailed)
  }
}

/** 等待站点运行时和原有网络稳定条件，只排除已确证的主文档统计上报。 */
export function navigateWebsite(page: Page, url: string) {
  return navigate(page, () => page.goto(url, { waitUntil: 'domcontentloaded' }))
}

/** 刷新时沿用相同的文档、资源与监听器生命周期。 */
export function reloadWebsite(page: Page) {
  return navigate(page, () => page.reload({ waitUntil: 'domcontentloaded' }))
}
