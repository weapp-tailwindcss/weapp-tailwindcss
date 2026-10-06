import { EventEmitter } from 'node:events'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatWorkflowError, runWithCleanup } from '../scripts/e2e-preflight/cleanup'
import { runLocalFullPlatformReport } from '../scripts/local-full-platform-report'

const mocks = vi.hoisted(() => ({ enter: vi.fn(), spawn: vi.fn() }))
vi.mock('../scripts/e2e-preflight/gate', () => ({ enterFullTestGate: mocks.enter }))
vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  spawn: mocks.spawn,
}))
vi.mock('node:fs/promises', async importOriginal => ({
  ...await importOriginal<typeof import('node:fs/promises')>(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}))
vi.mock('../e2e/coverageIdentity', () => ({ collectCoverageIdentity: vi.fn().mockResolvedValue({}) }))
vi.mock('../e2e/coverageReport', () => ({
  createCoverageReport: vi.fn().mockReturnValue({}),
  readCommittedCompatibilityEvidence: vi.fn().mockResolvedValue([]),
}))

describe('全面测试失败与资源收尾', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('LOCAL_FULL_REPORT_PROFILE', 'full')
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('本地报告入口在门禁和收尾同时失败时不丢失阶段及报告路径', async () => {
    const primary = new Error('Harmony 已掉线；报告：blocked/report.md')
    const cleanup = new Error('finish connection refused')
    const close = vi.fn().mockRejectedValue(cleanup)
    mocks.enter.mockResolvedValue({ env: {}, check: vi.fn().mockRejectedValue(primary), close })
    const error = await runLocalFullPlatformReport().catch(error => error)
    expect(error.errors).toEqual([primary, cleanup])
    expect(error.cause).toBe(primary)
    expect(close).toHaveBeenCalledOnce()
    expect(mocks.spawn).not.toHaveBeenCalled()
    expect(mkdir).toHaveBeenCalledOnce()
    const output = formatWorkflowError(error)
    for (const error of [primary, cleanup]) {
      for (const line of error.stack!.split('\n')) {
        expect(output).toContain(line.trim())
      }
    }
  })

  it('本地报告入口保留子进程退出失败并与收尾错误一起输出', async () => {
    const cleanup = new Error('finish unavailable')
    const close = vi.fn().mockRejectedValue(cleanup)
    mocks.enter.mockResolvedValue({ env: {}, check: vi.fn(), close })
    mocks.spawn.mockImplementation(() => {
      const child = new EventEmitter()
      queueMicrotask(() => child.emit('close', 2))
      return child
    })
    const previousExitCode = process.exitCode
    let error: unknown
    try {
      error = await runLocalFullPlatformReport().catch(error => error)
    }
    finally {
      process.exitCode = previousExitCode
    }
    expect(error).toBeInstanceOf(AggregateError)
    const errors = (error as AggregateError).errors
    expect(errors[0].message).toContain('quality failed with exit=2')
    expect(errors[0].message).toContain('README.md')
    expect(errors[1]).toBe(cleanup)
    expect(mocks.spawn).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
    const summary = vi.mocked(writeFile).mock.calls.find(([file]) => path.basename(String(file)) === 'summary.json')
    expect(JSON.parse(String(summary?.[1])).summary.failedStepCount).toBe(1)
  })

  it.each([undefined, null, false, 0, ''])('主错误 %s 不因假值而被清理异常覆盖', async (primary) => {
    const cleanup = new Error('cleanup failed')
    const close = vi.fn().mockRejectedValue(cleanup)
    const error = await runWithCleanup(() => Promise.reject(primary), close).catch(error => error)
    expect(error).toBeInstanceOf(AggregateError)
    expect(error.errors).toEqual([primary, cleanup])
    expect(close).toHaveBeenCalledOnce()
  })

  it('终端日志展开嵌套错误、底层原因并处理循环引用', () => {
    const primary = new Error('阶段失败；报告：blocked/report.md')
    const reportError = new Error('report write failed')
    const cleanup = new TypeError('fetch failed', { cause: new Error('ECONNREFUSED') })
    const error = new AggregateError([
      new AggregateError([primary, reportError], '保存失败报告异常', { cause: primary }),
      cleanup,
    ], 'workflow failed')
    error.cause = error
    const output = formatWorkflowError(error)
    for (const message of ['阶段失败；报告：blocked/report.md', 'report write failed', 'fetch failed', 'ECONNREFUSED']) {
      expect(output).toContain(message)
    }
    expect(output).toContain('[Circular')
    expect(output).not.toContain('\u001B[')
    expect(formatWorkflowError(undefined)).toBe('undefined')
  })
})
