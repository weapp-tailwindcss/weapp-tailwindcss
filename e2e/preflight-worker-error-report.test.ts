import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
import { runProbe } from '../scripts/e2e-preflight/probe'
import { wechat } from '../scripts/e2e-preflight/probes/desktop'
import { runOwnedWorker } from '../scripts/e2e-preflight/process'

vi.mock('../scripts/e2e-preflight/probes/desktop', () => ({ base: vi.fn(), hbuilderx: vi.fn(), wechat: vi.fn() }))
vi.mock('../scripts/e2e-preflight/process', () => ({ runOwnedWorker: vi.fn() }))
const dirs: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  vi.resetAllMocks()
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

it('worker stderr 与报告日志均保留原始聚合错误及 cause', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wt-preflight-error-'))
  dirs.push(dir)
  const context = { root: dir, dir, runId: 'error-report', url: 'http://127.0.0.1:1', phase: 'prepare' as const }
  const contextFile = path.join(dir, 'context.json')
  await writeFile(contextFile, JSON.stringify(context))
  const errors = ['App readiness failed', 'screenshot failed', 'disconnect failed', 'close failed'].map(message => new Error(message))
  const primary = new AggregateError(errors, 'probe failed', { cause: errors[0] })
  vi.mocked(wechat).mockRejectedValue(primary)
  const argv = process.argv
  const exitCode = process.exitCode
  const stderr: string[] = []
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderr.push(String(chunk))
    return true
  })
  try {
    process.argv = [process.execPath, 'worker.ts', 'wechat', contextFile, path.join(dir, 'result.json')]
    await import('../scripts/e2e-preflight/worker')
    expect(process.exitCode).toBe(1)
  }
  finally {
    process.argv = argv
    process.exitCode = exitCode
  }
  const workerLog = stderr.join('')
  for (const error of errors) {
    expect(workerLog).toContain(error.message)
  }
  vi.mocked(runOwnedWorker).mockRejectedValue(new Error('worker failed', { cause: primary }))
  const report = await runProbe('wechat', context)
  expect(report.status).toBe('blocked')
  const log = await readFile(report.evidence[0]!, 'utf8')
  for (const error of errors) {
    expect(report.detail).toContain(error.message)
    expect(log).toContain(error.message)
  }
})
