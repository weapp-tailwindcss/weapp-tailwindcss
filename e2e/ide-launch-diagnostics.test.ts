import { afterEach, expect, it, vi } from 'vitest'
import { launchWithDiagnostics } from './framework-ide/launch-diagnostics'
import { collectFrameworkIdeDiagnostics } from './frameworkIdeDiagnostics'

vi.mock('./frameworkIdeDiagnostics', () => ({ collectFrameworkIdeDiagnostics: vi.fn() }))
afterEach(() => vi.resetAllMocks())

it.each([new Error('readiness failed'), new AggregateError([new Error('readiness'), new Error('disconnect')], 'launch failed')])('外层启动失败不再重试，保留原错误：%s', async (error) => {
  const launch = vi.fn().mockRejectedValue(error)
  vi.mocked(collectFrameworkIdeDiagnostics).mockResolvedValue('diagnostics')
  await expect(launchWithDiagnostics('fixture', launch)).rejects.toBe(error)
  expect(launch).toHaveBeenCalledOnce()
  expect(error.message).toContain('diagnostics')
})

it('诊断失败不覆盖启动首因', async () => {
  const primary = new Error('readiness failed')
  const diagnostic = new Error('diagnostics denied')
  vi.mocked(collectFrameworkIdeDiagnostics).mockRejectedValue(diagnostic)
  const error = await launchWithDiagnostics('fixture', vi.fn().mockRejectedValue(primary)).catch(error => error)
  expect(error).toBeInstanceOf(AggregateError)
  expect(error.errors).toEqual([primary, diagnostic])
})
