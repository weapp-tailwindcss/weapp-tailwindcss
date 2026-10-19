import type { EvidenceModule } from './native-evidence'
import type { NativeMediaGateCapture, NativePlatformReport } from './types'
import { afterEach, expect, it, vi } from 'vitest'
import { createNativeEvidence } from './native-evidence'
import { mediaCapture } from './test-utils/native-media'

const context = { version: 1 as const, runId: '00000000-0000-4000-8000-000000000001', bundleSha256: 'a'.repeat(64) }
afterEach(() => vi.useRealTimers())

function host() {
  const capture = mediaCapture()
  const reporter = {
    getEvidenceContext: vi.fn<NonNullable<EvidenceModule['getEvidenceContext']>>(callback => callback(context)),
    submitArtifact: vi.fn<NonNullable<EvidenceModule['submitArtifact']>>(),
    captureMediaGate: vi.fn<NonNullable<EvidenceModule['captureMediaGate']>>((_run, callback) => callback(capture)),
    submit: vi.fn<NonNullable<EvidenceModule['submit']>>((_run, _report, callback) => callback(true)),
  }
  return { reporter, capture }
}

it('media gate只请求本轮run，注册原生六帧与专用侧车，禁止JS回传SDK和坐标', async () => {
  const { reporter, capture } = host()
  const writer = await createNativeEvidence(reporter)
  await expect(writer.mediaGate()).resolves.toEqual(capture.mediaGate)
  expect(reporter.captureMediaGate.mock.calls[0]!.slice(0, -1)).toEqual([context.runId])
  expect(reporter.submitArtifact).not.toHaveBeenCalled()
  await writer.submit({} as NativePlatformReport)
  expect(JSON.parse(reporter.submit.mock.calls[0]![1]).evidence).toEqual({ ...context, artifacts: capture.artifacts })
})

it.each(['missing-sidecar', 'missing-frame', 'duplicate', 'wrong-run', 'old-context', 'wrong-bundle', 'wrong-version', 'missing-probe', 'bad-rect', 'bad-hash', 'empty', 'missing-host', 'null'] as const)('media gate拒绝%s并阻止报告发布', async (mode) => {
  const { reporter, capture } = host()
  if (mode === 'missing-sidecar') {
    capture.artifacts.pop()
  }
  if (mode === 'missing-frame') {
    capture.artifacts.shift()
  }
  if (mode === 'duplicate') {
    capture.artifacts[6] = { ...capture.artifacts[0]! }
  }
  if (mode === 'wrong-run') {
    capture.artifacts[0]!.runId = 'old-run'
  }
  if (mode === 'old-context') {
    capture.mediaGate.runId = '00000000-0000-4000-8000-000000000002'
  }
  if (mode === 'wrong-bundle') {
    capture.mediaGate.bundleSha256 = 'c'.repeat(64)
  }
  if (mode === 'wrong-version') {
    capture.mediaGate.sdkVersion = '4.2.1'
  }
  if (mode === 'missing-probe') {
    capture.mediaGate.probes.pop()
  }
  if (mode === 'bad-rect') {
    capture.mediaGate.probes[0]!.probe.width = 100
  }
  if (mode === 'bad-hash') {
    capture.artifacts[0]!.sha256 = 'bad'
  }
  if (mode === 'empty') {
    capture.artifacts[0]!.byteLength = 0
  }
  if (mode === 'null') {
    reporter.captureMediaGate.mockImplementation((_run, callback) => callback(null))
  }
  const writer = await createNativeEvidence(mode === 'missing-host' ? { ...reporter, captureMediaGate: undefined } : reporter)
  await expect(writer.mediaGate()).rejects.toThrow()
  await expect(writer.submit({} as NativePlatformReport)).rejects.toThrow(/已失败/)
  expect(reporter.submit).not.toHaveBeenCalled()
})

it('media gate重复、待写和超时迟回执都不能发布部分证据', async () => {
  const { reporter, capture } = host()
  const duplicate = await createNativeEvidence(reporter)
  await duplicate.mediaGate()
  await expect(duplicate.mediaGate()).rejects.toThrow(/回执无效/)
  await expect(duplicate.submit({} as NativePlatformReport)).rejects.toThrow(/已失败/)
  vi.useFakeTimers()
  let complete: ((value: NativeMediaGateCapture | null) => void) | undefined
  reporter.captureMediaGate.mockImplementation((_run, callback) => {
    complete = callback
  })
  const writer = await createNativeEvidence(reporter)
  const pending = writer.mediaGate().catch(error => error as Error)
  await expect(writer.submit({} as NativePlatformReport)).rejects.toThrow(/未全部确认/)
  await vi.advanceTimersByTimeAsync(5001)
  expect(await pending).toMatchObject({ message: expect.stringContaining('超时') })
  complete!(capture)
  await expect(writer.submit({} as NativePlatformReport)).rejects.toThrow(/已失败/)
})
