import { afterEach, expect, it, vi } from 'vitest'
import { deliverSemanticFailure, nativeReportHeaders } from '../src/compatibility/report-client'

const ownedPage = globalThis as typeof globalThis & { __RN_E2E_CLIENT__?: string }
afterEach(() => {
  delete ownedPage.__RN_E2E_CLIENT__
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
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

it('失败报告再次拒绝时，仍向宿主交付原始错误与报告投递错误', async () => {
  ownedPage.__RN_E2E_CLIENT__ = 'owned-web-page'
  const fetch = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', fetch)
  const complete = vi.fn().mockRejectedValue(new Error('installation changed'))
  await expect(deliverSemanticFailure({ reportUrl: 'http://owned-host', runId: 'current-run', revision: 'current-phase', error: new Error('original measurement failure'), complete })).resolves.toEqual({ delivered: true })
  expect(complete).toHaveBeenCalledOnce()
  expect(fetch).toHaveBeenCalledOnce()
  const [url, options] = fetch.mock.calls[0]!
  expect(url).toBe('http://owned-host/error')
  expect(JSON.parse(options.body)).toEqual({ runId: 'current-run', revision: 'current-phase', message: 'Error: original measurement failure', reportDeliveryError: 'Error: installation changed' })
})

it.each(['network', 'http'] as const)('错误回执的 %s 失败返回显式未送达，不泄漏拒绝或冒称成功', async (kind) => {
  ownedPage.__RN_E2E_CLIENT__ = 'owned-web-page'
  vi.stubGlobal('fetch', kind === 'network' ? vi.fn().mockRejectedValue(new Error('network failed')) : vi.fn().mockResolvedValue({ ok: false, status: 403 }))
  const result = await deliverSemanticFailure({ reportUrl: 'http://owned-host', runId: '', revision: 'current-phase', error: 'original failure' })
  expect(result.delivered).toBe(false)
  expect(result).toEqual({ delivered: false, error: expect.stringMatching(kind === 'network' ? /network failed/ : /HTTP 403/) })
})
