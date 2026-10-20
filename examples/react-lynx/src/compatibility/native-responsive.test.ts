import type { EvidenceModule, NativeEvidenceWriter } from './native-evidence'
import type { ResponsiveCapture, ResponsivePhase } from './responsive-contract'
import type { NativePlatformReport } from './types'
import { afterEach, expect, it, vi } from 'vitest'
import { responsiveCapture } from '../../../../e2e/lynx/fixtures/responsive-images'
import { createNativeEvidence } from './native-evidence'
import { collectResponsive } from './native-responsive'

const context = { version: 1 as const, runId: '00000000-0000-4000-8000-000000000001', bundleSha256: 'a'.repeat(64) }
afterEach(() => vi.useRealTimers())

function host() {
  return {
    getEvidenceContext: vi.fn<NonNullable<EvidenceModule['getEvidenceContext']>>(callback => callback(context)),
    submitArtifact: vi.fn<NonNullable<EvidenceModule['submitArtifact']>>(),
    captureResponsive: vi.fn<NonNullable<EvidenceModule['captureResponsive']>>((runId, requestId, phase, callback) => callback(responsiveCapture(runId, requestId, phase))),
    submit: vi.fn<NonNullable<EvidenceModule['submit']>>((_run, _report, callback) => callback(true)),
  }
}

it('逐阶段等待宿主落盘回执，不向host上传尺寸；finally 恢复并收齐12份证据', async () => {
  const reporter = host()
  const writer = await createNativeEvidence(reporter)
  const result = await collectResponsive(writer)
  expect(reporter.captureResponsive.mock.calls.map(call => call[2])).toEqual(['narrow', 'wide', 'narrowed', 'restored'])
  expect(result.status).toBe('not-tested')
  expect(Object.keys(result.responsive!)).toHaveLength(4)
  expect(reporter.submitArtifact).not.toHaveBeenCalled()
  await writer.submit({} as NativePlatformReport)
  expect(JSON.parse(reporter.submit.mock.calls[0]![1]).evidence.artifacts).toHaveLength(12)
})

it.each(['run', 'request', 'phase', 'sidecar', 'receipt', 'missing-frame', 'corners'] as const)('拒绝 %s 变异并仍调用恢复桥，阻止最终发布', async (mode) => {
  const reporter = host()
  reporter.captureResponsive.mockImplementationOnce((run, requestId, phase, callback) => {
    const capture = responsiveCapture(run, requestId, phase)
    if (mode === 'run') {
      capture.frame.runId = 'old-run'
    }
    if (mode === 'request') {
      capture.frame.requestId = 'responsive-999999'
    }
    if (mode === 'phase') {
      capture.frame.phase = 'wide'
    }
    if (mode === 'sidecar') {
      capture.artifacts.pop()
    }
    if (mode === 'receipt') {
      capture.artifacts[0]!.runId = 'old-run'
    }
    if (mode === 'missing-frame') {
      capture.frame = undefined as never
    }
    if (mode === 'corners') {
      capture.frame.threshold.right = 4
    }
    callback(capture)
  })
  const writer = await createNativeEvidence(reporter)
  await expect(collectResponsive(writer)).rejects.toThrow('采集或恢复失败')
  expect(reporter.captureResponsive.mock.calls.map(call => call[2])).toEqual(['narrow', 'restored'])
  await expect(writer.submit({} as NativePlatformReport)).rejects.toThrow('已失败')
})

it('等待屏障期间不开始下一阶段，超时后迟到回执也不能发布', async () => {
  vi.useFakeTimers()
  const reporter = host()
  let late!: (value: ResponsiveCapture) => void
  let frame!: ResponsiveCapture
  reporter.captureResponsive.mockImplementationOnce((run, requestId, phase, callback) => {
    late = callback
    frame = responsiveCapture(run, requestId, phase)
  })
  const writer = await createNativeEvidence(reporter)
  const pending = collectResponsive(writer).catch(error => error)
  await Promise.resolve()
  expect(reporter.captureResponsive).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(5001)
  expect(await pending).toBeInstanceOf(AggregateError)
  late(frame)
  await expect(writer.submit({} as NativePlatformReport)).rejects.toThrow('已失败')
})

it('采集异常及恢复异常一起上报，不能通过恢复成功掩盖前序失败', async () => {
  const responsive = vi.fn(async (phase: ResponsivePhase) => {
    throw new Error(phase)
  })
  const writer = { responsive } as unknown as NativeEvidenceWriter
  const error = await collectResponsive(writer).catch(error => error)
  expect(error).toBeInstanceOf(AggregateError)
  expect(error.errors).toHaveLength(2)
  expect(responsive.mock.calls.map(call => call[0])).toEqual(['narrow', 'restored'])
})
