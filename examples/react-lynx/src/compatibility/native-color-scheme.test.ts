import type { ColorSchemeModule } from './native-color-scheme'
import type { NativeEvidenceWriter } from './native-evidence'
import type { NativeColorSchemeReceipt } from './types'
import { afterEach, expect, it, vi } from 'vitest'
import { collectColorScheme } from './native-color-scheme'

afterEach(() => vi.useRealTimers())

function fixture() {
  const calls: string[] = []
  const evidence = { runId: 'run', save: vi.fn(async (name: string) => {
    calls.push(name)
  }), submit: vi.fn() } as unknown as NativeEvidenceWriter
  const reporter = {
    setColorScheme: vi.fn<NonNullable<ColorSchemeModule['setColorScheme']>>((runId, requestId, scheme, callback) => {
      calls.push(scheme)
      callback({ runId, requestId, scheme })
    }),
    captureColorScheme: vi.fn<NonNullable<ColorSchemeModule['captureColorScheme']>>((_runId, _requestId, id, callback) => callback(`image:${id}`)),
  }
  return { reporter, evidence, calls }
}

it('切换前不拍图，四帧都完成落盘后恢复浅色，并保留三份回执', async () => {
  const { reporter, evidence, calls } = fixture()
  let acknowledge!: (value: NativeColorSchemeReceipt) => void
  let receipt!: NativeColorSchemeReceipt
  reporter.setColorScheme.mockImplementationOnce((runId, requestId, scheme, callback) => {
    receipt = { runId, requestId, scheme }
    acknowledge = callback
    calls.push(scheme)
  })
  const pending = collectColorScheme(reporter, evidence)
  await Promise.resolve()
  expect(reporter.captureColorScheme).not.toHaveBeenCalled()
  acknowledge(receipt)
  const result = await pending
  expect(calls).toEqual(['light', 'variant-dark-light-probe.png', 'variant-dark-light-control.png', 'dark', 'variant-dark-dark-probe.png', 'variant-dark-dark-control.png', 'light'])
  expect(result.status).toBe('not-tested')
  expect(result.colorScheme).toMatchObject({ light: { scheme: 'light' }, dark: { scheme: 'dark' }, restored: { scheme: 'light' } })
  expect(reporter.captureColorScheme.mock.calls.map(([run, request]) => [run, request])).toEqual([
    ['run', result.colorScheme!.light.requestId],
    ['run', result.colorScheme!.light.requestId],
    ['run', result.colorScheme!.dark.requestId],
    ['run', result.colorScheme!.dark.requestId],
  ])
})

it.each(['runId', 'requestId', 'scheme'] as const)('拒绝 %s 不符的回执，仍恢复浅色', async (field) => {
  const { reporter, evidence } = fixture()
  reporter.setColorScheme.mockImplementationOnce((runId, requestId, scheme, callback) => callback({ runId, requestId, scheme, [field]: 'wrong' }))
  await expect(collectColorScheme(reporter, evidence)).rejects.toThrow('采集或恢复失败')
  expect(reporter.captureColorScheme).not.toHaveBeenCalled()
  expect(reporter.setColorScheme.mock.calls.map(args => args[2])).toEqual(['light', 'light'])
})

it.each(['capture', 'save', 'timeout', 'throw'] as const)('%s 失败也等待恢复，并拒绝整次采集', async (failure) => {
  vi.useFakeTimers()
  const { reporter, evidence } = fixture()
  if (failure === 'capture') {
    reporter.captureColorScheme.mockImplementationOnce((_run, _id, _name, callback) => callback(null))
  }
  if (failure === 'save') {
    vi.mocked(evidence.save).mockRejectedValueOnce(new Error('disk full'))
  }
  if (failure === 'timeout') {
    reporter.setColorScheme.mockImplementationOnce(() => {})
  }
  if (failure === 'throw') {
    reporter.setColorScheme.mockImplementationOnce(() => {
      throw new Error('native fail')
    })
  }
  const pending = collectColorScheme(reporter, evidence).catch(error => error)
  await vi.runAllTimersAsync()
  expect(await pending).toBeInstanceOf(AggregateError)
  expect(reporter.setColorScheme.mock.calls.at(-1)?.[2]).toBe('light')
  expect(vi.getTimerCount()).toBe(0)
})

it('恢复错误与原错误同时保留；恢复完成前拒绝另一次采集', async () => {
  const { reporter, evidence } = fixture()
  reporter.captureColorScheme.mockImplementationOnce((_run, _id, _name, callback) => callback(null))
  let restore!: (value: NativeColorSchemeReceipt | null) => void
  reporter.setColorScheme.mockImplementationOnce((runId, requestId, scheme, callback) => callback({ runId, requestId, scheme }))
    .mockImplementationOnce((_run, _id, _scheme, callback) => { restore = callback })
  const pending = collectColorScheme(reporter, evidence).catch(error => error as AggregateError)
  await vi.waitFor(() => expect(restore).toBeTypeOf('function'))
  await expect(collectColorScheme(reporter, evidence)).rejects.toThrow('已在进行')
  restore(null)
  const error = await pending
  if (!(error instanceof AggregateError)) {
    throw new Error('预期采集与恢复都失败')
  }
  expect(error.errors).toHaveLength(2)
  expect(error.errors[1].message).toContain('恢复失败')
  await expect(collectColorScheme(reporter, evidence)).resolves.toMatchObject({ status: 'not-tested' })
})

it('迟到回执不能开始拍图或覆盖恢复回执', async () => {
  vi.useFakeTimers()
  const { reporter, evidence } = fixture()
  let late!: () => void
  reporter.setColorScheme.mockImplementationOnce((runId, requestId, scheme, callback) => {
    late = () => callback({ runId, requestId, scheme })
  })
  const pending = collectColorScheme(reporter, evidence).catch(error => error)
  await vi.runAllTimersAsync()
  expect(await pending).toBeInstanceOf(AggregateError)
  late()
  await Promise.resolve()
  expect(reporter.captureColorScheme).not.toHaveBeenCalled()
})
