import type { MiniProgram } from '@weapp-vite/miniprogram-automator'
import { setTimeout as delay } from 'node:timers/promises'

const PAGE_REQUEST_TIMEOUT_MS = 5_000
const PAGE_RETRY_DELAY_MS = 250
type WechatPage = Awaited<ReturnType<MiniProgram['currentPage']>>
type WechatButton = NonNullable<Awaited<ReturnType<WechatPage['$']>>>

function isTransientPageReadError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }
  const code = 'code' in error ? error.code : undefined
  const method = 'method' in error ? error.method : undefined
  return (code === 'DEVTOOLS_PROTOCOL_TIMEOUT' && (method === 'App.getCurrentPage' || method === 'Page.getData' || method === 'Page.getElements'))
    || /timeout waiting for automator response/i.test(error.message)
    || /page metadata (?:is )?not ready/i.test(error.message)
    || (error.message.includes('getPageMetaByWebviewId') && error.message.includes('rawPath') && error.message.includes('is null'))
    || error.message.includes('unexpected current frame status timedout')
}

async function readPageMarker(page: WechatPage, timeoutMs: number) {
  const data = await page.data('marker', { timeout: timeoutMs, fallback: false })
  return data && typeof data === 'object' && 'marker' in data ? data.marker : data
}

/** 先等待本轮页面元数据；每次协议读取有界，避免 SDK 默认重试放大 IDE 卡顿。 */
export async function waitForWechatPage(connection: Pick<MiniProgram, 'currentPage'>, runId: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  const remainingRequestTimeout = () => Math.max(1, Math.min(PAGE_REQUEST_TIMEOUT_MS, deadline - Date.now()))
  while (Date.now() < deadline) {
    try {
      const page = await connection.currentPage({
        timeout: remainingRequestTimeout(),
        retries: 1,
        pageStackFallback: false,
        appFunctionFallback: false,
      })
      if (Date.now() >= deadline) {
        break
      }
      const actual = await readPageMarker(page, remainingRequestTimeout())
      if (Date.now() >= deadline) {
        break
      }
      if (actual === runId) {
        return page
      }
      if (actual !== undefined && actual !== null && actual !== '' && actual !== runId) {
        throw new Error(`微信运行页面并非本轮探针：expected=${runId} actual=${actual}`)
      }
      lastError = new Error(`微信运行页面尚未报告本轮 marker：expected=${runId}`)
    }
    catch (error) {
      if (!isTransientPageReadError(error)) {
        throw error
      }
      lastError = error
    }
    const remaining = deadline - Date.now()
    if (remaining > 0) {
      await delay(Math.min(PAGE_RETRY_DELAY_MS, remaining))
    }
  }
  throw new Error(`微信本轮页面身份未在 ${timeoutMs}ms 内就绪。`, { cause: lastError })
}

/** 使用保留协议异常的批量查询等待唯一按钮，避免 SDK 单元素查询把超时吞成 null。 */
export async function waitForWechatProbeButton(page: WechatPage, runId: string, timeoutMs = 5_000): Promise<WechatButton> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  const remainingRequestTimeout = () => Math.max(1, Math.min(PAGE_REQUEST_TIMEOUT_MS, deadline - Date.now()))
  while (Date.now() < deadline) {
    try {
      const marker = await readPageMarker(page, remainingRequestTimeout())
      if (Date.now() >= deadline) {
        break
      }
      if (marker && marker !== runId) {
        throw new Error(`微信运行页面并非本轮探针：expected=${runId} actual=${marker}`)
      }
      if (marker === runId) {
        const buttons: WechatButton[] = await page.$$('#probe', { timeout: remainingRequestTimeout(), fallback: false })
        if (Date.now() >= deadline) {
          break
        }
        if (buttons.length > 1) {
          throw new Error('微信本轮探针匹配到多个交互按钮，拒绝点击。')
        }
        const button = buttons[0]
        if (button) {
          return button
        }
      }
      lastError = new Error(`微信本轮探针按钮尚未渲染：expected=${runId}`)
    }
    catch (error) {
      if (!isTransientPageReadError(error)) {
        throw error
      }
      lastError = error
    }
    const remaining = deadline - Date.now()
    if (remaining > 0) {
      await delay(Math.min(PAGE_RETRY_DELAY_MS, remaining))
    }
  }
  throw new Error(`微信本轮探针按钮未在 ${timeoutMs}ms 内就绪。`, { cause: lastError })
}

/** 协议连接超时后再调用截图只会追加请求并掩盖首次错误。 */
export function isWechatProtocolUnavailable(error: unknown, seen = new Set<object>()): boolean {
  if (!(error instanceof Error) || seen.has(error)) {
    return false
  }
  seen.add(error)
  const code = 'code' in error ? error.code : undefined
  if (['DEVTOOLS_PROTOCOL_TIMEOUT', 'DEVTOOLS_DISCONNECT_TIMEOUT', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE'].includes(String(code))) {
    return true
  }
  if (/timeout waiting for automator response|DevTools did not respond to protocol method|Connection closed, check if wechat web devTools|websocket.*closed/i.test(error.message)) {
    return true
  }
  if (error instanceof AggregateError && error.errors.some(item => isWechatProtocolUnavailable(item, seen))) {
    return true
  }
  return isWechatProtocolUnavailable(error.cause, seen)
}
