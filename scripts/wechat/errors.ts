/** 已有 IDE 服务、认证或会话身份无法确认，禁止继续请求或重置登录态。 */
export class WechatEnvironmentError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'WechatEnvironmentError'
  }
}

/** 只保留白名单业务码和响应形状，不把服务错误正文当成认证结论或写入日志。 */
export function wechatResponseDetail(status: number, result: unknown): string {
  const object = result && typeof result === 'object' && !Array.isArray(result)
    ? result as Record<string, unknown>
    : undefined
  const code = object?.code
  const allowed = new Set(['APPID_ERROR', 'PROJECT_PATH_NOT_FOUND', 'PROJECT_CONFIG_JSON_ERROR'])
  const safeCode = typeof code === 'number' && Number.isSafeInteger(code) && Math.abs(code) <= 1_000_000
    ? String(code)
    : typeof code === 'string' && allowed.has(code) ? code : undefined
  const shape = object ? '对象' : Array.isArray(result) ? '数组' : result === null ? 'null' : typeof result
  const category = status === 401 || status === 403
    ? '认证或服务授权未确认'
    : '服务或项目操作未完成，不能据此判定认证失败'
  return `${category}；响应类型=${shape}${safeCode === undefined ? '' : `；业务码=${safeCode}`}`
}

/** 只提取标准连接错误代码，避免把服务正文、URL 凭据或票据写入诊断。 */
export function wechatTransportDetail(error: unknown): string {
  const codes = new Set<string>()
  const allowed = new Set(['ECONNREFUSED', 'ECONNRESET', 'ECONNABORTED', 'EHOSTUNREACH', 'ENETUNREACH', 'ETIMEDOUT', 'EPIPE', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'])
  function collect(value: unknown, depth: number) {
    if (!value || typeof value !== 'object' || depth > 4) {
      return
    }
    if ('code' in value && typeof value.code === 'string' && allowed.has(value.code)) {
      codes.add(value.code)
    }
    if ('name' in value && (value.name === 'TimeoutError' || value.name === 'AbortError')) {
      codes.add(value.name)
    }
    if ('cause' in value) {
      collect(value.cause, depth + 1)
    }
    if ('errors' in value && Array.isArray(value.errors)) {
      for (const nested of value.errors) {
        collect(nested, depth + 1)
      }
    }
  }
  collect(error, 0)
  return [...codes].join(', ') || '未分类连接错误'
}

/** 仅在 SDK 的恢复流程已经返回终态异常后分类，不拦截底层 send 或匹配日志文字。 */
export function wechatProtocolEnvironmentError(error: unknown): WechatEnvironmentError | undefined {
  if (!(error instanceof Error) || !('code' in error) || error.code !== 'DEVTOOLS_PROTOCOL_TIMEOUT'
    || !('method' in error) || typeof error.method !== 'string'
    || !/^(?:App|Page|Element|Tool)\.[A-Za-z][A-Za-z0-9]*$/.test(error.method)) {
    return
  }
  return new WechatEnvironmentError(`微信 IDE 协议 ${error.method} 超时；停止本轮请求，保留登录态并重新预检。`, { cause: error })
}
