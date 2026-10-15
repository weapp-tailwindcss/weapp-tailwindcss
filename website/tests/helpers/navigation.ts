import type { Frame, Page, Request, Response } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { expect } from '@playwright/test'

const reportingOrigins = new Set([
  'https://www.google-analytics.com',
  'https://www.google.com',
])
const documentIdentityKey = 'weapp-tailwindcss:website:navigation-document'
const verifiedDocuments = new WeakMap<Page, { identity: string, response: Response }>()

function documentUrl(url: string) {
  const parsed = new URL(url)
  parsed.hash = ''
  return parsed.href
}

async function readDocument(page: Page) {
  return page.evaluate(async ({ key, identity }) => {
    const symbol = Symbol.for(key)
    if (!Reflect.has(document, symbol)) {
      Object.defineProperty(document, symbol, { value: identity })
    }
    const ready = document.readyState !== 'loading'
      && document.documentElement.dataset.hasHydrated === 'true'
      && document.fonts.status === 'loaded'
    if (ready) {
      await document.fonts.ready
    }
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    return {
      identity: Reflect.get(document, symbol) as string,
      url: document.URL,
      ready,
      navigationUrl: navigation?.name,
      responseStatus: navigation?.responseStatus,
      decodedBodySize: navigation?.decodedBodySize,
    }
  }, { key: documentIdentityKey, identity: randomUUID() })
}

function isReportingRequest(page: Page, request: Request) {
  if (request.frame() !== page.mainFrame() || request.isNavigationRequest() || request.resourceType() !== 'fetch') {
    return false
  }
  const url = new URL(request.url())
  return reportingOrigins.has(url.origin) && url.pathname === '/g/collect'
}

function successfulResponse(response: Response, runtime?: Awaited<ReturnType<typeof readDocument>>) {
  if (response.ok()) {
    return true
  }
  if (response.status() !== 304) {
    return false
  }
  // Firefox 暴露网络层 304，但导航性能记录保存浏览器合并缓存后的状态和正文大小。
  // 自动重验证头不出现在 Firefox 的 Playwright Request 中，不能据此判断缓存是否存在。
  return Boolean(runtime?.navigationUrl && documentUrl(runtime.navigationUrl) === documentUrl(response.url())
    && typeof runtime.responseStatus === 'number' && runtime.responseStatus >= 200 && runtime.responseStatus < 300
    && typeof runtime.decodedBodySize === 'number' && runtime.decodedBodySize > 0)
}

function assertDocumentResponse(response: Response | null | undefined, runtime?: Awaited<ReturnType<typeof readDocument>>) {
  if (!response || !successfulResponse(response, runtime)) {
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
  let documentFinished = false
  let committedRequest: Request | undefined

  const onRequest = (request: Request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      // 客户端语言跳转会换文档，旧文档的请求不能阻塞或污染新文档。
      generation += 1
      pending.clear()
      documentRequest = request
      documentResponse = undefined
      documentFailure = undefined
      documentFinished = false
      committedRequest = undefined
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
    if (request === documentRequest) {
      documentFinished = true
    }
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
  const onNavigated = (frame: Frame) => {
    if (frame === page.mainFrame()) {
      lastActivity = Date.now()
      if (documentResponse && documentUrl(frame.url()) === documentUrl(documentResponse.url())) {
        committedRequest = documentRequest
      }
    }
  }

  page.on('request', onRequest)
  page.on('response', onResponse)
  page.on('requestfinished', onFinished)
  page.on('requestfailed', onFailed)
  page.on('framenavigated', onNavigated)
  try {
    const initialDocument = await readDocument(page)
    const previous = verifiedDocuments.get(page)
    const retainedResponse = previous?.identity === initialDocument.identity ? previous.response : undefined
    const actionResponse = await action()
    if (actionResponse && actionResponse.status() >= 400) {
      assertDocumentResponse(actionResponse)
    }
    let accepted: { identity: string, response: Response, generation: number } | undefined
    let latestRuntime: Awaited<ReturnType<typeof readDocument>> | undefined
    await expect.poll(async () => {
      if (documentFailure || (documentResponse && documentResponse.status() !== 304 && !documentResponse.ok())) {
        return 'failed'
      }
      if (!documentRequest && !retainedResponse) {
        return 'failed'
      }
      if (pending.size > 0 || Date.now() - lastActivity < 500) {
        return 'pending'
      }
      const currentGeneration = generation
      let runtime: Awaited<ReturnType<typeof readDocument>>
      try {
        runtime = await readDocument(page)
      }
      catch (error) {
        if (currentGeneration !== generation) {
          return 'pending'
        }
        throw error
      }
      if (currentGeneration !== generation) {
        return 'pending'
      }
      latestRuntime = runtime
      const response = documentRequest ? documentResponse : retainedResponse
      if (response && !successfulResponse(response, runtime)) {
        return 'failed'
      }
      const ownsDocument = documentRequest
        ? documentFinished && committedRequest === documentRequest && runtime.identity !== initialDocument.identity
        && response && documentUrl(runtime.url) === documentUrl(response.url())
        // History API 可以改 URL；同文档复用以已验证的 Document 身份为准。
        : runtime.identity === initialDocument.identity
      if (runtime.ready && ownsDocument && response && currentGeneration === generation
        && pending.size === 0 && Date.now() - lastActivity >= 500) {
        accepted = { identity: runtime.identity, response, generation }
        return 'ready'
      }
      return 'pending'
    }, {
      message: '等待最终文档 hydration、字体和非统计资源连续 500ms 空闲',
      intervals: [50, 100],
    }).not.toBe('pending')
    expect(documentFailure, '最终文档请求必须成功').toBeUndefined()
    const finalResponse = documentRequest ? documentResponse : retainedResponse
    assertDocumentResponse(finalResponse, latestRuntime)
    expect(accepted, '最终文档必须拥有已确认的响应、运行时和资源证据').toBeDefined()
    expect(accepted!.generation, '验收期间不能切换文档代际').toBe(generation)
    expect(accepted!.response, '验收响应必须仍属于最终文档').toBe(finalResponse)
    expect(pending.size, '验收期间不能产生新的非统计资源').toBe(0)
    verifiedDocuments.set(page, accepted!)
    return accepted!.response
  }
  finally {
    page.off('request', onRequest)
    page.off('response', onResponse)
    page.off('requestfinished', onFinished)
    page.off('requestfailed', onFailed)
    page.off('framenavigated', onNavigated)
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
