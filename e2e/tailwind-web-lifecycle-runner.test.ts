import type { Browser } from 'playwright'
import type { CapabilityReport } from './tailwind-capabilities/types'
import { beforeEach, expect, it, vi } from 'vitest'
import { runLifecycleWeb } from './tailwind-capabilities/web-lifecycle/run'

const state = vi.hoisted(() => ({ reports: [] as CapabilityReport[], persist: vi.fn() }))

vi.mock('./tailwind-capabilities/context', () => ({
  newReport: vi.fn(async (context, target, _contracts, _fixture, environment) => {
    const report = { schemaVersion: 2, runId: context.runId, target, environment, results: [], artifacts: [] } as unknown as CapabilityReport
    state.reports.push(report)
    return report
  }),
  persistReport: state.persist,
}))

vi.mock('./tailwind-capabilities/report', () => ({ validateCapabilityReport: vi.fn(), verifyReportArtifacts: vi.fn() }))

beforeEach(() => {
  state.reports.length = 0
  state.persist.mockClear()
})

function borrowedBrowser(newPageFailure: string, cleanupFailure = '') {
  const owned = { newPage: vi.fn().mockRejectedValue(new Error(newPageFailure)), close: cleanupFailure ? vi.fn().mockRejectedValue(new Error(cleanupFailure)) : vi.fn().mockResolvedValue(undefined) }
  const browser = { version: () => 'contract-browser', newContext: vi.fn().mockResolvedValue(owned), close: vi.fn() }
  return { owned, browser }
}

it('newPage 创建失败仍关闭已登记的 context，借用 browser 不关闭', async () => {
  const { browser, owned } = borrowedBrowser('newPage unavailable')
  const report = await runLifecycleWeb({ root: 'unused', directory: 'unused', runId: 'ownership' }, 'chromium', browser as unknown as Browser)
  expect(report.results).toHaveLength(2)
  expect(report.results.every(result => result.status === 'blocked' && result.reason?.includes('newPage unavailable'))).toBe(true)
  expect(owned.close).toHaveBeenCalledTimes(1)
  expect(browser.close).not.toHaveBeenCalled()
  expect(browser.newContext).toHaveBeenCalledWith(expect.objectContaining({ reducedMotion: 'no-preference', deviceScaleFactor: 1 }))
  expect(state.persist).toHaveBeenCalledTimes(1)
})

it('清理失败使所有结果失败并留下具体归属，不扩大清理范围', async () => {
  const { browser, owned } = borrowedBrowser('newPage unavailable', 'owned context could not close')
  const report = await runLifecycleWeb({ root: 'unused', directory: 'unused', runId: 'ownership' }, 'webkit', browser as unknown as Browser)
  expect(report.results.every(result => result.status === 'failed' && result.reason?.includes('owned context could not close'))).toBe(true)
  expect(report.environment.cleanupError).toContain('owned context could not close')
  expect(owned.close).toHaveBeenCalledTimes(1)
  expect(browser.close).not.toHaveBeenCalled()
})

it('空过滤在创建任何资源前明确失败', async () => {
  const { browser, owned } = borrowedBrowser('unused')
  await expect(runLifecycleWeb({ root: 'unused', directory: 'unused', runId: 'ownership', caseFilter: /does-not-match/ }, 'firefox', browser as unknown as Browser)).rejects.toThrow('没有匹配')
  expect(browser.newContext).not.toHaveBeenCalled()
  expect(owned.close).not.toHaveBeenCalled()
  expect(state.persist).not.toHaveBeenCalled()
})
