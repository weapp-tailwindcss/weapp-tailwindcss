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

it('切换前不拍图，恢复后两帧也落盘，六帧绑定各自请求并保留三份回执', async () => {
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
  expect(calls).toEqual(['light', 'variant-dark-light-probe.png', 'variant-dark-light-control.png', 'dark', 'variant-dark-dark-probe.png', 'variant-dark-dark-control.png', 'light', 'variant-dark-restored-probe.png', 'variant-dark-restored-control.png'])
  expect(result.status).toBe('not-tested')
  expect(result.colorScheme).toMatchObject({ light: { scheme: 'light' }, dark: { scheme: 'dark' }, restored: { scheme: 'light' } })
  expect(reporter.captureColorScheme.mock.calls.map(([run, request]) => [run, request])).toEqual([
    ['run', result.colorScheme!.light.requestId],
    ['run', result.colorScheme!.light.requestId],
    ['run', result.colorScheme!.dark.requestId],
    ['run', result.colorScheme!.dark.requestId],
    ['run', result.colorScheme!.restored.requestId],
    ['run', result.colorScheme!.restored.requestId],
  ])
})

it.each(['probe', 'control'])('恢复 %s 帧缺证时拒绝成功报告', async (frame) => {
  const { reporter, evidence } = fixture()
  reporter.captureColorScheme.mockImplementation((run, requestId, id, callback) => {
    const restored = reporter.setColorScheme.mock.calls.length === 3
    callback(restored && id === `${frame}-container-variant-dark` ? null : `image:${run}:${requestId}:${id}`)
  })
  await expect(collectColorScheme(reporter, evidence)).rejects.toThrow('采集或恢复失败')
})

it('恢复最后一帧写入完成前仍持有采集锁', async () => {
  const { reporter, evidence } = fixture()
  let release!: () => void
  vi.mocked(evidence.save).mockImplementation(async (name) => {
    if (name === 'variant-dark-restored-control.png') {
      await new Promise<void>((resolve) => {
        release = resolve
      })
    }
  })
  const pending = collectColorScheme(reporter, evidence)
  await vi.waitFor(() => expect(release).toBeTypeOf('function'))
  await expect(collectColorScheme(reporter, evidence)).rejects.toThrow('已在进行')
  release()
  await expect(pending).resolves.toMatchObject({ status: 'not-tested' })
})

it('恢复截图写入失败不能只凭恢复回执发布报告', async () => {
  const { reporter, evidence } = fixture()
  vi.mocked(evidence.save).mockImplementation(async (name) => {
    if (name === 'variant-dark-restored-control.png') {
      throw new Error('disk full during restore')
    }
  })
  await expect(collectColorScheme(reporter, evidence)).rejects.toThrow('采集或恢复失败')
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
