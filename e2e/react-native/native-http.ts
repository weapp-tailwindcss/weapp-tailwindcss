import type { IncomingMessage } from 'node:http'
import { get } from 'node:http'

export function getHttpText(url: string, timeout = 2_000, cancelSignal?: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    cancelSignal?.throwIfAborted()
    const deadline = performance.now() + timeout
    let settled = false
    let incoming: IncomingMessage | undefined
    const finish = (error?: unknown, body?: string) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      cancelSignal?.removeEventListener('abort', cancel)
      if (error !== undefined) {
        reject(error)
        incoming?.destroy()
        request.destroy()
      }
      else {
        resolve(body ?? '')
      }
    }
    const expired = () => finish(new Error(`Timed out requesting ${url}`))
    const cancel = () => finish(cancelSignal?.reason ?? new Error('Native HTTP request cancelled'))
    const request = get(url, (response) => {
      incoming = response
      response.setEncoding('utf8')
      let body = ''
      response.on('data', (chunk) => {
        body += chunk
      })
      response.once('end', () => {
        if (cancelSignal?.aborted) {
          cancel()
        }
        else if (performance.now() >= deadline) {
          expired()
        }
        else {
          finish(undefined, body)
        }
      })
      response.once('error', error => finish(error))
      response.once('aborted', () => finish(new Error(`Response closed before completion: ${url}`)))
      response.once('close', () => {
        if (!response.complete) {
          finish(new Error(`Response closed before completion: ${url}`))
        }
      })
    })
    // 独立计时覆盖完整响应；持续收到数据不能延长 Metro 探测预算。
    const timer = setTimeout(expired, Math.max(0, deadline - performance.now()))
    request.once('error', error => finish(error))
    cancelSignal?.addEventListener('abort', cancel, { once: true })
    if (cancelSignal?.aborted) {
      cancel()
    }
  })
}
