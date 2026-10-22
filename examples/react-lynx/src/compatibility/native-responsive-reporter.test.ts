import type { EvidenceModule } from './native-evidence'
import type { NativePlatformReport } from './types'
import { afterEach, expect, it, vi } from 'vitest'
import { responsiveCapture } from '../../../../e2e/lynx/fixtures/responsive-images'
import { submitNativeCompatibilityReport } from './native-reporter'
import { mediaCapture } from './test-utils/native-media'

// 主题控制器的状态与失败恢复由 native-theme-overrides.test.ts 独立验证；此处隔离原有 reporter 维度。
vi.mock('./native-theme-overrides', () => ({ collectThemeOverrides: vi.fn(async () => ({ contract: 'lynx-theme-overrides-v1', frames: [] })) }))

vi.mock('./catalog', async (importOriginal) => {
  const original = await importOriginal<typeof import('./catalog')>()
  return { ...original, compatibilityCases: original.compatibilityCases.filter(item => item.id === 'variant-responsive') }
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function collect(fault?: 'wide' | 'restored') {
  vi.useFakeTimers()
  const runId = '00000000-0000-4000-8000-000000000001'
  let report: NativePlatformReport | undefined
  const capture = vi.fn<NonNullable<EvidenceModule['captureResponsive']>>((run, requestId, phase, callback) => callback(phase === fault ? null : responsiveCapture(run, requestId, phase)))
  const measure = vi.fn((_id: string, callback: (value: object) => void) => callback({ width: 64, height: 48 }))
  const submitArtifact = vi.fn()
  const fail = vi.fn((_run: string, _message: string, callback: (value: boolean) => void) => callback(true))
  vi.stubGlobal('SystemInfo', { platform: 'Android' })
  vi.stubGlobal('NativeModules', { CompatibilityReporter: {
    getEvidenceContext: (callback: (value: object) => void) => callback({ version: 1, runId, bundleSha256: 'a'.repeat(64) }),
    captureMediaGate: (_run: string, callback: (value: object) => void) => callback(mediaCapture()),
    captureResponsive: capture,
    measure,
    submitArtifact,
    fail,
    submit: (_run: string, value: string, callback: (value: boolean) => void) => {
      report = JSON.parse(value)
      callback(true)
    },
  } })
  const pending = submitNativeCompatibilityReport().catch(error => error)
  await vi.runAllTimersAsync()
  return { error: await pending, report, capture, measure, submitArtifact, fail }
}

it('原生reporter使用根 viewport 专用宿主链，旧 measure 几何不能替代', async () => {
  const { error, report, capture, measure, submitArtifact } = await collect()
  expect(error).toBeUndefined()
  expect(capture.mock.calls.map(call => call[2])).toEqual(['narrow', 'wide', 'narrowed', 'restored'])
  expect(measure.mock.calls.some(([id]) => id.includes('variant-responsive'))).toBe(false)
  expect(submitArtifact).not.toHaveBeenCalled()
  expect(report!.results[0]).toMatchObject({ status: 'not-tested', checkpoints: [{ name: 'viewport:responsive-v1', passed: false }] })
  expect(report!.evidence!.artifacts.filter(receipt => receipt.name.startsWith('variant-responsive-'))).toHaveLength(12)
})

it.each(['wide', 'restored'] as const)('%s 缺证阻止报告发布，保存失败并尝试恢复', async (fault) => {
  const { error, report, capture, fail } = await collect(fault)
  expect(error).toBeInstanceOf(AggregateError)
  expect(report).toBeUndefined()
  expect(capture.mock.calls.at(-1)![2]).toBe('restored')
  expect(fail).toHaveBeenCalledOnce()
})
