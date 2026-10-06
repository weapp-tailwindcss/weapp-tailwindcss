import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runFrameworkIdeProbeWithRetry } from './frameworkIdeProbeRunner'

const { execa, diagnostics } = vi.hoisted(() => ({
  execa: vi.fn(),
  diagnostics: vi.fn().mockResolvedValue('[e2e:ide] diagnostics for fixture'),
}))

vi.mock('execa', () => ({ execa }))
vi.mock('./frameworkIdeDiagnostics', () => ({ collectFrameworkIdeDiagnostics: diagnostics }))

afterEach(() => {
  execa.mockReset()
  diagnostics.mockClear()
  vi.restoreAllMocks()
})

const timing = {
  attemptTimeoutMs: 1000,
  maxAttempts: 2,
  relaunchTimeoutMs: 100,
  settleTimeoutMs: 0,
  timeoutMs: 100,
}

describe('framework IDE probe retries', () => {
  it('preserves the original failure and both process streams before a successful retry', async () => {
    const error = Object.assign(new Error('Framework IDE probe launch timed out: fixture'), {
      shortMessage: 'probe exited with code 1',
      stdout: '[e2e:ide] last successful stage: watch ready',
      stderr: 'original DevTools transport error',
    })
    execa.mockRejectedValueOnce(error).mockResolvedValueOnce({ stdout: '' })
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    await runFrameworkIdeProbeWithRetry('fixture', timing)

    const output = write.mock.calls.map(call => call[0]).join('')
    expect(output).toContain('Framework IDE probe launch timed out: fixture')
    expect(output).toContain(error.stdout)
    expect(output).toContain(error.stderr)
    expect(output).toContain(error.shortMessage)
    expect(output).toContain('[e2e:ide] diagnostics for fixture')
    expect(execa).toHaveBeenCalledTimes(2)
  })

  it('throws the last original failure when the retry is exhausted', async () => {
    const first = new Error('Framework IDE probe launch timed out: first attempt')
    const last = new Error('Framework IDE probe reLaunch timed out: second attempt')
    execa.mockRejectedValueOnce(first).mockRejectedValueOnce(last)
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    await expect(runFrameworkIdeProbeWithRetry('fixture', timing)).rejects.toBe(last)

    expect(write.mock.calls.map(call => call[0]).join('')).toContain(first.stack)
    expect(execa).toHaveBeenCalledTimes(2)
  })

  it('does not retry a non-transient product failure', async () => {
    const error = new Error('IDE HMR artifacts missed transformed classes')
    execa.mockRejectedValueOnce(error)
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    await expect(runFrameworkIdeProbeWithRetry('fixture', timing)).rejects.toBe(error)

    expect(execa).toHaveBeenCalledOnce()
    expect(write).not.toHaveBeenCalled()
  })

  it('瞬时探针错误同时伴随清理失败时，禁止启动下一轮', async () => {
    const error = Object.assign(new Error('Framework IDE probe reLaunch timed out'), {
      stderr: '[e2e:ide:cleanup] Failed to restore IDE project config: disk denied',
    })
    execa.mockRejectedValue(error)
    await expect(runFrameworkIdeProbeWithRetry('fixture', timing)).rejects.toBe(error)
    expect(execa).toHaveBeenCalledOnce()
  })
})
