import type { EvidenceModule } from './native-evidence'
import type { NativeArtifactReceipt, NativePlatformReport } from './types'
import { afterEach, expect, it, vi } from 'vitest'
import { createNativeEvidence } from './native-evidence'

const context = { version: 1 as const, runId: '00000000-0000-4000-8000-000000000001', bundleSha256: 'a'.repeat(64) }
const receipt = { runId: context.runId, name: 'case-probe.png', sha256: 'b'.repeat(64), byteLength: 100 }
afterEach(() => vi.useRealTimers())

function native() {
  const submit = vi.fn<NonNullable<EvidenceModule['submit']>>((_run, _report, callback) => callback(true))
  return {
    getEvidenceContext: vi.fn<NonNullable<EvidenceModule['getEvidenceContext']>>(callback => callback(context)),
    submitArtifact: vi.fn<NonNullable<EvidenceModule['submitArtifact']>>((_run, _name, _data, callback) => callback(receipt)),
    submit,
  }
}

it('超时后的迟到回执不能恢复失败会话或发布报告', async () => {
  vi.useFakeTimers()
  const reporter = native()
  let complete: ((value: NativeArtifactReceipt) => void) | undefined
  reporter.submitArtifact.mockImplementation((_run, _name, _data, callback) => {
    complete = callback
  })
  const writer = await createNativeEvidence(reporter)
  const failure = writer.save(receipt.name, 'png').catch(error => error as Error)
  await vi.advanceTimersByTimeAsync(2001)
  expect(await failure).toMatchObject({ message: expect.stringContaining('超时') })
  complete!(receipt)
  await expect(writer.submit({} as NativePlatformReport)).rejects.toThrow(/已失败/)
  expect(reporter.submit).not.toHaveBeenCalled()
})

it('待写图期间不能发布，全部确认后只发布一次', async () => {
  const reporter = native()
  let complete: ((value: NativeArtifactReceipt) => void) | undefined
  reporter.submitArtifact.mockImplementation((_run, _name, _data, callback) => {
    complete = callback
  })
  const writer = await createNativeEvidence(reporter)
  const pending = writer.save(receipt.name, 'png')
  await expect(writer.submit({} as NativePlatformReport)).rejects.toThrow(/未全部确认/)
  complete!(receipt)
  await pending
  await writer.submit({} as NativePlatformReport)
  expect(JSON.parse(reporter.submit.mock.calls[0]![1]).evidence).toEqual({ ...context, artifacts: [receipt] })
  await expect(writer.submit({} as NativePlatformReport)).rejects.toThrow(/已提交/)
  expect(reporter.submit).toHaveBeenCalledTimes(1)
})

it('host 报告写入失败不会被当成发布成功', async () => {
  const reporter = native()
  reporter.submit.mockImplementation((_run, _report, callback) => callback(false))
  const writer = await createNativeEvidence(reporter)
  await writer.save(receipt.name, 'png')
  await expect(writer.submit({} as NativePlatformReport)).rejects.toThrow(/未确认报告落盘/)
})

it('旧 host 缺少回执方法时不开始采集', async () => {
  await expect(createNativeEvidence({ submit: native().submit })).rejects.toThrow(/缺少 evidence 协议/)
})
