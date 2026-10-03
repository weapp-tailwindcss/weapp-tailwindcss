import { mkdir, writeFile } from 'node:fs/promises'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { formatWorkflowError } from '../scripts/e2e-preflight/cleanup'
import { enterFullTestGate } from '../scripts/e2e-preflight/gate'
import { passingCheck } from './preflight-fixture'

const mocks = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../scripts/e2e-preflight/client', () => ({ readReport: vi.fn().mockResolvedValue({}), request: mocks.request }))
vi.mock('../scripts/e2e-preflight/io', async importOriginal => ({
  ...await importOriginal<typeof import('../scripts/e2e-preflight/io')>(),
  collectIdentity: vi.fn().mockResolvedValue({}),
}))
vi.mock('node:fs/promises', async importOriginal => ({
  ...await importOriginal<typeof import('node:fs/promises')>(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('LYNX_IOS_DESTINATION', undefined)
})
afterEach(() => vi.unstubAllEnvs())

it.each([mkdir, writeFile])('领取失败且报告无法写入时保留原始缺证错误', async (write) => {
  const diskError = new Error('EACCES: blocked report')
  vi.mocked(write).mockRejectedValueOnce(diskError)
  const error = await enterFullTestGate().catch(error => error)
  expect(error).toBeInstanceOf(AggregateError)
  expect(error.errors[0].message).toContain('缺少 --preflight-report')
  expect(error.errors[1]).toBe(diskError)
  expect(formatWorkflowError(error)).toContain('未启动测试子进程')
  expect(mocks.request).not.toHaveBeenCalled()
})

it('阶段复查失败且报告写入失败时保留阶段与原始网络错误', async () => {
  const bindings = Object.fromEntries(['android', 'ios', 'harmony', 'hbuilderx', 'wechat', 'web'].map(id => [id, passingCheck(id as 'android').binding!]))
  mocks.request.mockResolvedValueOnce({ lease: 'lease', bindings })
  const gate = await enterFullTestGate('current.json')
  const primary = new TypeError('check fetch failed')
  const diskError = new Error('ENOSPC: blocked report')
  mocks.request.mockRejectedValueOnce(primary)
  vi.mocked(writeFile).mockRejectedValueOnce(diskError)
  const error = await gate.check('Harmony HMR').catch(error => error)
  expect(error.errors).toEqual([primary, diskError])
  expect(error.cause).toBe(primary)
  const output = formatWorkflowError(error)
  expect(output).toContain('Harmony HMR')
  expect(output).toContain('停止后续调度')
})
