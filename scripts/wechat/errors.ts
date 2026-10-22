/** 已有 IDE 服务、认证或会话身份无法确认，禁止继续请求或重置登录态。 */
export class WechatEnvironmentError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'WechatEnvironmentError'
  }
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
