import type { Page, Request, Response } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { test } from '@playwright/test'

interface NavigationState {
  generation: number
  lastActivity: number
  pending: Set<Request>
  documentRequest?: Request
  documentResponse?: Response
  documentFailure?: string
  documentFinished: boolean
  committedRequest?: Request
  initialDocumentIdentity?: string
}

/** 只记录公开 API 证据，不推断 Request 的发起 Document，也不参与 readiness。 */
export function createNavigationDiagnostics(page: Page, state: () => NavigationState, documentIdentityKey: string) {
  const started = Date.now()
  const requestIds = new WeakMap<Request, number>()
  const requestObservations = new WeakMap<Request, Record<string, unknown>>()
  const events: Array<Record<string, unknown>> = []
  const runtime: Array<Record<string, unknown>> = []
  let requestSequence = 0
  let lastObservation = 0
  let observation: Promise<void> | undefined
  let eventCount = 0
  let readiness: Record<string, unknown> = { stage: 'action', atMs: 0 }

  function requestId(request: Request | undefined) {
    if (!request) {
      return undefined
    }
    let id = requestIds.get(request)
    if (!id) {
      id = ++requestSequence
      requestIds.set(request, id)
      requestObservations.set(request, { firstObservedAtMs: Date.now() - started, firstObservedGeneration: state().generation })
    }
    return id
  }

  function describeRequest(request: Request) {
    const errors: Array<{ field: string, error: string }> = []
    function read<T>(field: string, value: () => T) {
      try {
        return value()
      }
      catch (error) {
        errors.push({ field, error: String(error) })
        return undefined
      }
    }
    const frame = read('frame', () => request.frame())
    return {
      id: requestId(request),
      url: read('url', () => request.url()),
      method: read('method', () => request.method()),
      resourceType: read('resourceType', () => request.resourceType()),
      navigation: read('isNavigationRequest', () => request.isNavigationRequest()),
      mainFrame: frame ? frame === page.mainFrame() : undefined,
      frameUrl: frame && read('frame.url', () => frame.url()),
      referer: read('referer', () => request.headers().referer),
      redirectedFrom: read('redirectedFrom', () => requestId(request.redirectedFrom() ?? undefined)),
      // 待响应请求可能为 0；保留未知值，不能拿事件到达时间替代网络起始时间。
      timing: read('timing', () => ({ ...request.timing() })),
      failure: read('failure', () => request.failure()?.errorText),
      observation: requestObservations.get(request),
      errors,
    }
  }

  function describeResponse(response: Response | undefined) {
    return response && {
      requestId: requestId(response.request()),
      url: response.url(),
      status: response.status(),
    }
  }

  function record(type: string, request?: Request, details: Record<string, unknown> = {}) {
    try {
      eventCount += 1
      if (request) {
        requestId(request)
        requestObservations.set(request, { ...requestObservations.get(request), lastEvent: type, lastEventAtMs: Date.now() - started })
      }
      events.push({
        atMs: Date.now() - started,
        type,
        observedGeneration: state().generation,
        ...(request ? { request: describeRequest(request) } : {}),
        ...details,
      })
      if (events.length > 100) {
        events.shift()
      }
    }
    catch {
      // 诊断失败不得改变原有事件处理与验收结果。
    }
  }

  function checkpoint(stage: string, details: Record<string, unknown> = {}) {
    readiness = { stage, atMs: Date.now() - started, ...details }
  }

  function describeError(error: unknown, depth = 0): unknown {
    return error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack, ...(error.cause === undefined ? {} : { cause: depth < 3 ? describeError(error.cause, depth + 1) : '[因果链截断]' }) }
      : { message: String(error) }
  }

  function observe() {
    if (observation || Date.now() - lastObservation < 1_000) {
      return
    }
    lastObservation = Date.now()
    const startedAtMs = Date.now() - started
    const startedObservedGeneration = state().generation
    observation = page.evaluate((key) => {
      const navigation = performance.getEntriesByType('navigation')[0] as (PerformanceNavigationTiming & { deliveryType?: string }) | undefined
      return {
        url: document.URL,
        identity: Reflect.get(document, Symbol.for(key)) ?? null,
        readyState: document.readyState,
        hydrated: document.documentElement.dataset.hasHydrated === 'true',
        fonts: document.fonts.status,
        timeOrigin: performance.timeOrigin,
        navigation: navigation && {
          url: navigation.name,
          responseStatus: navigation.responseStatus,
          decodedBodySize: navigation.decodedBodySize,
          deliveryType: navigation.deliveryType,
        },
      }
    }, documentIdentityKey).then(
      (document) => { runtime.push({ startedAtMs, startedObservedGeneration, completedAtMs: Date.now() - started, completedObservedGeneration: state().generation, document }) },
      (error) => { runtime.push({ startedAtMs, startedObservedGeneration, completedAtMs: Date.now() - started, completedObservedGeneration: state().generation, error: String(error) }) },
    ).finally(() => {
      if (runtime.length > 5) {
        runtime.shift()
      }
      observation = undefined
    })
  }

  async function attach(error: unknown) {
    try {
      // 失败时补一次只读快照；上下文销毁或脚本卡住不能拖延、覆盖原异常。
      lastObservation = 0
      observe()
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([observation, new Promise<void>((resolve) => {
          timer = setTimeout(resolve, 250)
        })])
      }
      finally {
        clearTimeout(timer)
      }
      const current = state()
      const pending = [...current.pending]
      const diagnostic = {
        schemaVersion: 1,
        scope: 'navigation-helper-failure',
        startedAt: new Date(started).toISOString(),
        capturedAt: new Date().toISOString(),
        error: describeError(error),
        browser: page.context().browser()?.browserType().name(),
        pageUrl: page.url(),
        navigation: {
          initialDocumentIdentity: current.initialDocumentIdentity,
          generation: current.generation,
          request: current.documentRequest && describeRequest(current.documentRequest),
          response: describeResponse(current.documentResponse),
          failure: current.documentFailure,
          finished: current.documentFinished,
          committedRequestId: requestId(current.committedRequest),
          idleMs: Date.now() - current.lastActivity,
        },
        readiness,
        pending: { count: pending.length, omitted: Math.max(0, pending.length - 100), requests: pending.slice(0, 100).map(describeRequest) },
        eventsOmitted: eventCount - events.length,
        events,
        runtimeObservationPending: !!observation,
        runtime,
      }
      await test.info().attach('website-navigation-state.json', {
        body: Buffer.from(JSON.stringify(diagnostic, null, 2)),
        contentType: 'application/json',
      })
    }
    catch (diagnosticError) {
      // 保留原异常；附件写入失败作为独立诊断信息输出，不伪装成成功取证。
      console.error('网站导航诊断附件写入失败：', diagnosticError)
    }
  }

  return { record, observe, attach, describeResponse, checkpoint }
}
