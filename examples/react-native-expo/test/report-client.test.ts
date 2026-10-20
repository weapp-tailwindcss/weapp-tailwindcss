import { afterEach, expect, it, vi } from 'vitest'
import { nativeReportHeaders } from '../src/compatibility/report-client'

const ownedPage = globalThis as typeof globalThis & { __RN_E2E_CLIENT__?: string }
afterEach(() => {
  delete ownedPage.__RN_E2E_CLIENT__
  vi.unstubAllEnvs()
})

it('Web 使用只注入所属页面的 capability，其他页面没有身份', () => {
  vi.stubEnv('EXPO_PUBLIC_RN_REPORT_CLIENT', '')
  expect(() => nativeReportHeaders()).toThrow(/Missing owned/)
  ownedPage.__RN_E2E_CLIENT__ = 'owned-web-page'
  expect(nativeReportHeaders()).toEqual({ 'content-type': 'application/json', 'x-rn-e2e-client': 'owned-web-page' })
})

it('原生沿用当前 Metro 进程能力，页面注入优先于环境中的旧值', () => {
  vi.stubEnv('EXPO_PUBLIC_RN_REPORT_CLIENT', 'native-run')
  expect(nativeReportHeaders()['x-rn-e2e-client']).toBe('native-run')
  ownedPage.__RN_E2E_CLIENT__ = 'owned-web-page'
  expect(nativeReportHeaders()['x-rn-e2e-client']).toBe('owned-web-page')
})
