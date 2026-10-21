/** 已有 IDE 服务、认证或会话身份无法确认，禁止继续请求或重置登录态。 */
export class WechatEnvironmentError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'WechatEnvironmentError'
  }
}
