import type { NativeGeometryCapture } from './native-geometry'
import type { NativeMediaGateCapture, NativePlatformReport } from './types'
import { afterEach, expect, it, vi } from 'vitest'
import { geometryArtifactNames } from './native-geometry'
import { submitNativeCompatibilityReport } from './native-reporter'
import { mediaCapture } from './test-utils/native-media'

vi.mock('./catalog', async (importOriginal) => {
  const original = await importOriginal<typeof import('./catalog')>()
  return { ...original, compatibilityCases: original.compatibilityCases.filter(item => item.id === 'sizing-fixed') }
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function collect(missingHost = false, fault?: 'view-expired' | 'measure-timeout' | 'geometry-null' | 'media-null' | 'media-missing') {
  vi.useFakeTimers()
  const runId = '00000000-0000-4000-8000-000000000001'
  const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height })
  const capture: NativeGeometryCapture = {
    geometry: {
      probe: rect(0, 0, 123, 40),
      control: rect(200, 0, 80, 40),
      probeContainer: rect(0, 0, 160, 140),
      controlContainer: rect(200, 0, 160, 140),
      probeChild: rect(0, 0, 12, 12),
      controlChild: rect(200, 0, 12, 12),
    },
    artifacts: geometryArtifactNames('sizing-fixed').map(name => ({ runId, name, sha256: 'b'.repeat(64), byteLength: 100 })),
  }
  let report: NativePlatformReport | undefined
  const measure = vi.fn((_id: string, callback: (value: object) => void) => callback(rect(0, 0, 64, 48)))
  const captureGeometry = vi.fn((_run: string, _id: string, callback: (value: NativeGeometryCapture) => void) => callback(capture))
  if (fault === 'measure-timeout') {
    measure.mockImplementation(() => {})
  }
  if (fault === 'view-expired') {
    captureGeometry.mockImplementation((_run, _id, callback) => callback({
      error: { version: 1, source: 'lynx-native-evidence', category: 'environment', code: 'view-expired', message: 'View binding expired' },
    } as never))
  }
  if (fault === 'geometry-null') {
    captureGeometry.mockImplementation((_run, _id, callback) => callback(null as never))
  }
  const fail = vi.fn((_run: string, _message: string, callback: (value: boolean) => void) => callback(true))
  vi.stubGlobal('SystemInfo', { platform: 'Android' })
  vi.stubGlobal('NativeModules', { CompatibilityReporter: {
    getEvidenceContext: (callback: (value: object) => void) => callback({ version: 1, runId, bundleSha256: 'a'.repeat(64) }),
    measure,
    captureGeometry: missingHost ? undefined : captureGeometry,
    captureMediaGate: fault === 'media-missing' ? undefined : (_run: string, callback: (value: NativeMediaGateCapture | null) => void) => callback(fault === 'media-null' ? null : mediaCapture()),
    submitArtifact: vi.fn(),
    fail,
    submit: (_run: string, value: string, callback: (value: boolean) => void) => {
      report = JSON.parse(value)
      callback(true)
    },
  } })
  const pending = submitNativeCompatibilityReport().catch(error => error as Error)
  await vi.runAllTimersAsync()
  return { error: await pending, report, capture, captureGeometry, measure, fail }
}

it('reporter只用captureGeometry回传的原生坐标和已落盘三回执', async () => {
  const { report, capture, captureGeometry, measure, error } = await collect()
  expect(error).toBeUndefined()
  expect(captureGeometry.mock.calls[0]!.slice(0, 2)).toEqual([report!.evidence!.runId, 'sizing-fixed'])
  expect(measure.mock.calls.every(([id]) => !id.includes('sizing-fixed'))).toBe(true)
  expect(report!.results[0]).toMatchObject({ status: 'supported', geometry: capture.geometry })
  expect(report!.mediaGate).toEqual(mediaCapture().mediaGate)
  expect(report!.evidence!.artifacts).toEqual([...mediaCapture().artifacts, ...capture.artifacts])
})

it('旧宿主即使能measure也不能发布没有独立几何落盘的报告', async () => {
  const { report, error } = await collect(true)
  expect(report).toBeUndefined()
  expect(error).toBeInstanceOf(Error)
  expect((error as Error).message).toMatch(/缺少原生几何采集协议/)
})

it.each(['view-expired', 'measure-timeout'] as const)('reporter将%s作为结构化故障保存，不发布能力报告', async (fault) => {
  const { report, error, fail } = await collect(false, fault)
  expect(report).toBeUndefined()
  const code = fault === 'measure-timeout' ? 'receipt-timeout' : fault
  expect(error).toMatchObject({ code })
  expect(JSON.parse(fail.mock.calls[0]![1])).toMatchObject({ version: 1, source: 'lynx-native-evidence', category: 'environment', code })
})

it('真实geometry回传null不写环境故障标记', async () => {
  const { report, error, fail } = await collect(false, 'geometry-null')
  expect(report).toBeUndefined()
  expect(error).not.toHaveProperty('code')
  expect(fail.mock.calls[0]![1]).toContain('原生几何或落盘清单无效')
  expect(fail.mock.calls[0]![1]).not.toContain('"category":"environment"')
})

it('原生平台完全缺桥不再静默返回', async () => {
  vi.stubGlobal('SystemInfo', { platform: 'Android' })
  vi.stubGlobal('NativeModules', {})
  await expect(submitNativeCompatibilityReport()).rejects.toMatchObject({ code: 'bridge-unavailable' })
})

it.each(['media-null', 'media-missing'] as const)('reporter拒绝%s，不能发布缺少媒体侧车的能力报告', async (fault) => {
  const { report, error, captureGeometry, fail } = await collect(false, fault)
  expect(report).toBeUndefined()
  expect(error).toBeInstanceOf(Error)
  expect(captureGeometry).not.toHaveBeenCalled()
  expect(fail).toHaveBeenCalledOnce()
})
