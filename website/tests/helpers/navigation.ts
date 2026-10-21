import type { Frame, Page, Request, Response } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { expect } from '@playwright/test'
import { commitCacheRepresentation, matchesCacheRepresentation, readCacheRepresentation } from './document-cache'
import { createNavigationDiagnostics } from './navigation-diagnostics'

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
    const navigation = performance.getEntriesByType('navigation')[0] as (PerformanceNavigationTiming & { deliveryType?: string }) | undefined
    return {
      identity: Reflect.get(document, symbol) as string,
      url: document.URL,
      ready,
      navigationUrl: navigation?.name,
      responseStatus: navigation?.responseStatus,
      decodedBodySize: navigation?.decodedBodySize,
      deliveryType: navigation?.deliveryType,
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

async function successfulResponse(page: Page, response: Response, runtime?: Awaited<ReturnType<typeof readDocument>>) {
  if (response.ok()) {
    return true
  }
  if (response.status() !== 304) {
    return false
  }
  // Firefox 暴露网络层 304，但导航性能记录保存浏览器合并缓存后的状态和正文大小。
  // 自动重验证头不出现在 Firefox 的 Playwright Request 中，不能据此判断缓存是否存在。
  if (!runtime?.navigationUrl || documentUrl(runtime.navigationUrl) !== documentUrl(response.url())) {
    return false
  }
  if (typeof runtime.responseStatus === 'number' && runtime.responseStatus >= 200 && runtime.responseStatus < 300
    && typeof runtime.decodedBodySize === 'number' && runtime.decodedBodySize > 0) {
    return true
  }
  return matchesCacheRepresentation(page, response, runtime.deliveryType)
}

async function assertDocumentResponse(page: Page, response: Response | null | undefined, runtime?: Awaited<ReturnType<typeof readDocument>>) {
  if (!response || !await successfulResponse(page, response, runtime)) {
    throw new Error(`网站导航失败：HTTP ${response?.status() ?? '无响应'} ${response?.url() ?? ''}`)
  }
}

/** 动作前安装监听器，统一核对硬导航与客户端导航的文档和资源生命周期。 */
export async function withWebsiteNavigation(page: Page, action: () => Promise<Response | null>) {
  const pending = new Set<Request>()
  const representations = new Map<Request, {
    response: Response
    evidence: ReturnType<typeof readCacheRepresentation>
    finished: boolean
    failed: boolean
  }>()
  let generation = 0
  let lastActivity = Date.now()
  let documentRequest: Request | undefined
  let documentResponse: Response | undefined
  let documentFailure: string | undefined
  let documentFinished = false
  let committedRequest: Request | undefined
  let initialDocumentIdentity: string | undefined
  const diagnostics = createNavigationDiagnostics(page, () => ({
    generation,
    lastActivity,
    pending,
    documentRequest,
    documentResponse,
    documentFailure,
    documentFinished,
    committedRequest,
    initialDocumentIdentity,
  }), documentIdentityKey)

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
    const reporting = isReportingRequest(page, request)
    if (!reporting) {
      pending.add(request)
      lastActivity = Date.now()
    }
    diagnostics.record('request', request, { reporting })
  }
  const onResponse = (response: Response) => {
    const request = response.request()
    if (request.isNavigationRequest() && request.frame() === page.mainFrame() && request.method() === 'GET' && response.ok()) {
      // 语言跳转的中间文档也可能完成 HTTP 缓存；来源只证明表示，不代替最终运行时。
      // 无法读取正文的响应不提供缓存证据，后续 304 仍必须拒绝缺证来源。
      representations.set(request, { response, evidence: readCacheRepresentation(response).catch(() => undefined), finished: false, failed: false })
    }
    if (request === documentRequest) {
      documentResponse = response
    }
    diagnostics.record('response', request, { response: diagnostics.describeResponse(response) })
  }
  const settleRequest = (request: Request) => {
    const representation = representations.get(request)
    if (representation) {
      representation.finished = true
    }
    if (request === documentRequest) {
      documentFinished = true
    }
    if (pending.delete(request)) {
      lastActivity = Date.now()
    }
  }
  const onFinished = (request: Request) => {
    settleRequest(request)
    diagnostics.record('finished', request)
  }
  const onFailed = (request: Request) => {
    settleRequest(request)
    const representation = representations.get(request)
    if (representation) {
      representation.failed = true
    }
    if (request === documentRequest) {
      documentFailure = request.failure()?.errorText ?? '文档请求失败'
    }
    diagnostics.record('failed', request)
  }
  const onNavigated = (frame: Frame) => {
    if (frame === page.mainFrame()) {
      lastActivity = Date.now()
      if (documentResponse && documentUrl(frame.url()) === documentUrl(documentResponse.url())) {
        committedRequest = documentRequest
      }
      diagnostics.record('commit', undefined, { url: frame.url() })
    }
  }

  page.on('request', onRequest)
  page.on('response', onResponse)
  page.on('requestfinished', onFinished)
  page.on('requestfailed', onFailed)
  page.on('framenavigated', onNavigated)
  try {
    const initialDocument = await readDocument(page)
    initialDocumentIdentity = initialDocument.identity
    const previous = verifiedDocuments.get(page)
    const retainedResponse = previous?.identity === initialDocument.identity ? previous.response : undefined
    const actionResponse = await action()
    if (actionResponse && actionResponse.status() >= 400) {
      await assertDocumentResponse(page, actionResponse)
    }
    let accepted: { identity: string, response: Response, generation: number } | undefined
    let latestRuntime: Awaited<ReturnType<typeof readDocument>> | undefined
    await expect.poll(async () => {
      diagnostics.observe()
      if (documentFailure || (documentResponse && documentResponse.status() !== 304 && !documentResponse.ok())) {
        return 'failed'
      }
      if (!documentRequest && !retainedResponse) {
        return 'failed'
      }
      if (pending.size > 0 || Date.now() - lastActivity < 500) {
        diagnostics.checkpoint('resources-or-idle')
        return 'pending'
      }
      diagnostics.checkpoint('runtime')
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
      const responseSuccessful = response && await successfulResponse(page, response, runtime)
      if (currentGeneration !== generation) {
        return 'pending'
      }
      if (response && !responseSuccessful) {
        return 'failed'
      }
      const ownsDocument = documentRequest
        ? documentFinished && committedRequest === documentRequest && runtime.identity !== initialDocument.identity
        && response && documentUrl(runtime.url) === documentUrl(response.url())
        // History API 可以改 URL；同文档复用以已验证的 Document 身份为准。
        : runtime.identity === initialDocument.identity
      diagnostics.checkpoint('document', { currentGeneration, ready: runtime.ready, ownsDocument, responseSuccessful })
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
    if (!accepted) {
      await assertDocumentResponse(page, finalResponse, latestRuntime)
    }
    expect(accepted, '最终文档必须拥有已确认的响应、运行时和资源证据').toBeDefined()
    expect(accepted!.generation, '验收期间不能切换文档代际').toBe(generation)
    expect(accepted!.response, '验收响应必须仍属于最终文档').toBe(finalResponse)
    const cacheEvidence = await Promise.all([...representations.values()]
      .filter(source => source.finished && !source.failed)
      .map(async source => ({ response: source.response, representation: await source.evidence })))
    const finalRuntime = await readDocument(page)
    expect(finalRuntime.ready, '读取缓存证据后运行时必须仍就绪').toBe(true)
    expect(finalRuntime.identity, '读取缓存证据期间不能替换 Document').toBe(accepted!.identity)
    expect(finalRuntime.url, '读取缓存证据期间不能改变文档 URL').toBe(latestRuntime!.url)
    expect(generation, '读取缓存证据期间不能切换文档代际').toBe(accepted!.generation)
    expect(pending.size, '验收期间不能产生新的非统计资源').toBe(0)
    expect(Date.now() - lastActivity, '读取缓存证据后资源必须仍连续空闲').toBeGreaterThanOrEqual(500)
    for (const source of cacheEvidence) {
      commitCacheRepresentation(page, source.response, source.representation)
    }
    verifiedDocuments.set(page, accepted!)
    return accepted!.response
  }
  catch (error) {
    await diagnostics.attach(error)
    throw error
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
  return withWebsiteNavigation(page, () => page.goto(url, { waitUntil: 'domcontentloaded' }))
}

/** 刷新时沿用相同的文档、资源与监听器生命周期。 */
export function reloadWebsite(page: Page) {
  return withWebsiteNavigation(page, () => page.reload({ waitUntil: 'domcontentloaded' }))
}
