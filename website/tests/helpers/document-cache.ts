import type { Page, Response } from '@playwright/test'
import { createHash } from 'node:crypto'

interface CacheRepresentation {
  etag: string
  bodySha256: string
  vary: Map<string, string | undefined>
}

const verifiedRepresentations = new WeakMap<Page, Map<string, CacheRepresentation>>()

function varyFields(value: string | undefined) {
  const fields = [...new Set((value ?? '').split(',').map(field => field.trim().toLowerCase()).filter(Boolean))].sort()
  return fields.some(field => !/^[!#$%&'*+\-.^_`|~0-9a-z]+$/.test(field) || field === '*') ? undefined : fields
}

function allowsStorage(headers: Record<string, string>) {
  return !/(?:^|,)\s*no-store\s*(?:,|$|=)/i.test(headers['cache-control'] ?? '') && !headers['content-range']
}

/** 读取完整 GET 表示的原始正文与缓存身份；调用方另须确认请求完成且未失败。 */
export async function readCacheRepresentation(response: Response) {
  if (!response.ok() || response.status() === 206 || response.request().method() !== 'GET') {
    return undefined
  }
  const headers = await response.allHeaders()
  const etag = headers.etag
  const fields = varyFields(headers.vary)
  if (!etag || !/^(?:W\/)?"[^"]*"$/.test(etag) || !allowsStorage(headers) || !fields) {
    return undefined
  }
  const [body, requestHeaders] = await Promise.all([response.body(), response.request().allHeaders()])
  return body.length > 0
    ? { etag, bodySha256: createHash('sha256').update(body).digest('hex'), vary: new Map(fields.map(field => [field, requestHeaders[field]])) }
    : undefined
}

/** 当前导航全部门禁通过后提交已完成的 HTTP 来源；不可存储响应撤销同 URL 旧来源。 */
export function commitCacheRepresentation(page: Page, response: Response, representation: CacheRepresentation | undefined) {
  if (!response.ok()) {
    return
  }
  let entries = verifiedRepresentations.get(page)
  if (!entries) {
    entries = new Map()
    verifiedRepresentations.set(page, entries)
  }
  if (representation) {
    entries.set(response.url(), representation)
  }
  else {
    entries.delete(response.url())
  }
}

/** 浏览器未提供合并后的性能状态时，以 HTTP 来源和三方 validator 证明同一缓存表示。 */
export async function matchesCacheRepresentation(page: Page, response: Response, deliveryType: string | undefined) {
  const prior = verifiedRepresentations.get(page)?.get(response.url())
  if (!prior || deliveryType !== 'cache' || response.request().method() !== 'GET') {
    return false
  }
  const [requestHeaders, responseHeaders] = await Promise.all([
    response.request().allHeaders(),
    response.allHeaders(),
  ])
  const declaredVary = responseHeaders.vary === undefined ? [...prior.vary.keys()] : varyFields(responseHeaders.vary)
  return requestHeaders['if-none-match'] === prior.etag && responseHeaders.etag === prior.etag
    && allowsStorage(responseHeaders) && declaredVary?.length === prior.vary.size
    && declaredVary.every(field => prior.vary.has(field) && requestHeaders[field] === prior.vary.get(field))
}
