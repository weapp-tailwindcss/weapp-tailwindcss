import { parseLynxHarnessFailure } from '../lynx/native-failure'

/** 环境故障与产品断言失败分开传播，禁止捕获后继续调度。 */
export class EnvironmentBlockedError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'EnvironmentBlockedError'
  }
}

/** 仅识别工具明确报告的环境故障；样式、截图及报告断言继续作为测试失败。 */
export function environmentFailure(output: string): string | undefined {
  const nativeFailure = parseLynxHarnessFailure(output)
  if (nativeFailure) {
    return nativeFailure
  }
  const patterns = [
    /Can't determine id of Simulator app[^\r\n]*/,
    /(?:spawn|command) [^\r\n]*\bENOENT\b[^\r\n]*/,
    /(?:device|emulator)[^\r\n]*(?:offline|disconnected|not found|unavailable)/i,
    /(?:No booted|Unable to find a destination matching)[^\r\n]*/,
    /com\.apple\.CoreSimulator\.SimError[^\r\n]*\r?\nUnable to lookup in current state:\s*Shutdown\b[^\r\n]*/i,
    /CoreSimulatorService connection (?:became invalid|interrupted|lost)\b[^\r\n]*/i,
    /iOS target app termination failed:[^\r\n]*/,
    /(?:微信|wechat)[^\r\n]*(?:登录失效|未登录|认证失败|not logged in|invalid session)/i,
  ]
  return patterns.map(pattern => output.match(pattern)?.[0]).find(Boolean)
}
