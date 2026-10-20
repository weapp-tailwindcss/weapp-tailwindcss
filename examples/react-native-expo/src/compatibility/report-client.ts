/* eslint-disable node/prefer-global/process */

/** Web capability 由宿主仅注入所属页面，原生 capability 随本轮 Metro 环境传入。 */
export function nativeReportHeaders() {
  const ownedPage = globalThis as typeof globalThis & { __RN_E2E_CLIENT__?: string }
  const client = ownedPage.__RN_E2E_CLIENT__ || process.env.EXPO_PUBLIC_RN_REPORT_CLIENT
  if (!client) {
    throw new Error('Missing owned React Native evidence client')
  }
  return { 'content-type': 'application/json', 'x-rn-e2e-client': client }
}
