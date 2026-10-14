import { mkdir } from 'node:fs/promises'
import process from 'node:process'
import { expect, it, vi } from 'vitest'
import { runPreflightDaemon } from '../scripts/e2e-preflight/daemon'
import { collectIdentity } from '../scripts/e2e-preflight/io'
import { PreflightSession } from '../scripts/e2e-preflight/session'

vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>()
  return { ...actual, mkdir: vi.fn() }
})
vi.mock('../scripts/e2e-preflight/daemon', () => ({ runPreflightDaemon: vi.fn() }))
vi.mock('../scripts/e2e-preflight/io', async (original) => {
  const actual = await original<typeof import('../scripts/e2e-preflight/io')>()
  return { ...actual, collectIdentity: vi.fn() }
})

it('CLI 顶层错误日志展开执行、取消、保存与资源收尾的聚合详情', async () => {
  const failures = ['probe-failed', 'cancel-failed', 'save-failed', 'server-close-failed', 'lock-release-failed'].map(message => new Error(message))
  const failure = new AggregateError([failures[0], new AggregateError(failures.slice(1), 'shutdown-failed')], 'daemon-failed')
  vi.mocked(runPreflightDaemon).mockRejectedValue(failure)
  vi.mocked(mkdir).mockResolvedValue(undefined)
  vi.mocked(collectIdentity).mockResolvedValue({} as never)
  vi.spyOn(PreflightSession.prototype, 'save').mockResolvedValue(undefined)
  const argv = process.argv
  const exitCode = process.exitCode
  const stderr: string[] = []
  let printed!: () => void
  const logged = new Promise<void>((resolve) => {
    printed = resolve
  })
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderr.push(String(chunk))
    printed()
    return true
  })
  try {
    process.argv = [process.execPath, 'cli.ts', 'prepare']
    await import('../scripts/e2e-preflight/cli')
    await logged
    expect(process.exitCode).toBe(1)
    for (const error of failures) {
      expect(stderr.join('')).toContain(error.message)
    }
  }
  finally {
    process.argv = argv
    process.exitCode = exitCode
    vi.restoreAllMocks()
  }
})
