import { expect, it, vi } from 'vitest'
import { until } from './process.mjs'

it('轮询后会话退出时保留终止原因、最后就绪错误和日志，不再执行检查', async () => {
  const readiness = new Error('Development update transport is not ready')
  const terminal = new Error('fixture session deadline exceeded')
  const ensureRunning = vi.fn()
    .mockImplementationOnce(() => {})
    .mockImplementation(() => { throw terminal })
  const check = vi.fn().mockRejectedValue(readiness)
  const failure = await until(check, { ensureRunning, log: () => 'fixture session log' }).catch(error => error)

  expect(failure).toBeInstanceOf(AggregateError)
  expect(failure.errors).toHaveLength(2)
  expect(failure.errors[0]).toBe(terminal)
  expect(failure.errors[1]).toBe(readiness)
  expect(failure.message).toContain(terminal.message)
  expect(failure.message).toContain(readiness.stack)
  expect(failure.message).toContain('fixture session log')
  expect(check).toHaveBeenCalledTimes(1)
  expect(ensureRunning).toHaveBeenCalledTimes(2)
})

it('首次检查前退出仍保留原错误身份', async () => {
  const terminal = new Error('fixture child exited')
  const check = vi.fn()
  await expect(until(check, {
    ensureRunning() {
      throw terminal
    },
  })).rejects.toBe(terminal)
  expect(check).not.toHaveBeenCalled()
})
