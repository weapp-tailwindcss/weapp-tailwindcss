import type { Browser } from 'playwright'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { runAutofillWeb } from './tailwind-capabilities/web-autofill/run'

vi.mock('./tailwind-capabilities/context', () => ({
  newReport: async (context: { directory: string }, target: string, _contracts: unknown, _fixture: unknown, environment: unknown) => {
    await mkdir(context.directory, { recursive: true })
    return { target, environment, results: [], artifacts: [], identity: {} }
  },
  persistReport: vi.fn(),
}))
vi.mock('./tailwind-capabilities/report', async (original) => {
  const actual = await original<typeof import('./tailwind-capabilities/report')>()
  return { ...actual, validateCapabilityReport: vi.fn(), verifyReportArtifacts: vi.fn() }
})
const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

it.each([false, true])('页面创建失败仍关闭自有 context，cleanup 失败=%s 时也保留原始错误', async (cleanupFails) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'autofill-cleanup-'))
  directories.push(directory)
  const close = cleanupFails ? vi.fn().mockRejectedValue(new Error('owned context close failed')) : vi.fn().mockResolvedValue(undefined)
  const sharedClose = vi.fn()
  const browser = { version: () => 'unit-browser', close: sharedClose, newContext: async () => ({ newPage: async () => {
    throw new Error('newPage failed')
  }, close }) } as unknown as Browser
  const report = await runAutofillWeb({ directory, root: directory, runId: 'unit-cleanup' }, 'chromium', browser)
  expect(close).toHaveBeenCalledOnce()
  expect(sharedClose).not.toHaveBeenCalled()
  expect(report.results[0]?.status).toBe('failed')
  expect(report.results[0]?.reason).toContain('newPage failed')
  if (cleanupFails) {
    expect(report.environment['cleanupError']).toContain('owned context close failed')
  }
})
