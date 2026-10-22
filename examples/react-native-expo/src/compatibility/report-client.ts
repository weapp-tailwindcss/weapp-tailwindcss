/* eslint-disable node/prefer-global/process */

import type { NativeSemanticDiagnostic } from './protocol'

/** Web capability 由宿主仅注入所属页面，原生 capability 随本轮 Metro 环境传入。 */
export function nativeReportHeaders() {
  const ownedPage = globalThis as typeof globalThis & { __RN_E2E_CLIENT__?: string }
  const client = ownedPage.__RN_E2E_CLIENT__ || process.env.EXPO_PUBLIC_RN_REPORT_CLIENT
  if (!client) {
    throw new Error('Missing owned React Native evidence client')
  }
  return { 'content-type': 'application/json', 'x-rn-e2e-client': client }
}

/** 失败报告的二次拒绝不能阻断原始错误送达；网络失败也必须向调用者明确返回。 */
export async function deliverSemanticFailure(input: { reportUrl: string, runId: string, revision: string, error: unknown, diagnostic?: NativeSemanticDiagnostic, complete?: () => void | Promise<void> }): Promise<{ delivered: true } | { delivered: false, error: string }> {
  const body: { runId: string, revision: string, message: string, reportDeliveryError?: string, diagnostic?: NativeSemanticDiagnostic } = { runId: input.runId, revision: input.revision, message: String(input.error), ...(input.diagnostic ? { diagnostic: input.diagnostic } : {}) }
  try {
    await input.complete?.()
  }
  catch (error) {
    body.reportDeliveryError = String(error)
  }
  try {
    const response = await fetch(`${input.reportUrl}/error`, { method: 'POST', headers: nativeReportHeaders(), body: JSON.stringify(body) })
    if (!response.ok) {
      throw new Error(`Native error receipt HTTP ${response.status}`)
    }
    return { delivered: true }
  }
  catch (error) {
    return { delivered: false, error: String(error) }
  }
}
