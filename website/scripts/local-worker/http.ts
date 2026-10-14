export interface LocalWorkerResponse {
  status: number
  headers: Headers
  text: string
}

/** 同一请求预算覆盖响应头与响应体，不让已连接但未完成的服务挂住验收。 */
export async function requestWorker(url: URL, signal: AbortSignal, timeoutMs: number): Promise<LocalWorkerResponse> {
  signal.throwIfAborted()
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(Math.max(1, Math.ceil(timeoutMs)))])
  try {
    const response = await fetch(url, { redirect: 'manual', signal: requestSignal })
    const text = await response.text()
    requestSignal.throwIfAborted()
    return { status: response.status, headers: response.headers, text }
  }
  catch (error) {
    signal.throwIfAborted()
    throw new Error(`Worker 本地请求失败：${url.href}，预算=${timeoutMs}ms`, { cause: error })
  }
}
