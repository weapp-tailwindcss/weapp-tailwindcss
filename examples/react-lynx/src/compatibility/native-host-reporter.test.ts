import type { NativeGeometryCapture } from './native-geometry'
import type { NativePlatformReport } from './types'
import { afterEach, expect, it, vi } from 'vitest'
import { geometryArtifactNames } from './native-geometry'
import { submitNativeCompatibilityReport } from './native-reporter'

vi.mock('./catalog', async (importOriginal) => {
  const original = await importOriginal<typeof import('./catalog')>()
  return { ...original, compatibilityCases: original.compatibilityCases.filter(item => item.id === 'sizing-fixed') }
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function collect(missingHost = false) {
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
  vi.stubGlobal('SystemInfo', { platform: 'Android' })
  vi.stubGlobal('NativeModules', { CompatibilityReporter: {
    getEvidenceContext: (callback: (value: object) => void) => callback({ version: 1, runId, bundleSha256: 'a'.repeat(64) }),
    measure,
    captureGeometry: missingHost ? undefined : captureGeometry,
    submitArtifact: vi.fn(),
    fail: (_run: string, _message: string, callback: (value: boolean) => void) => callback(true),
    submit: (_run: string, value: string, callback: (value: boolean) => void) => {
      report = JSON.parse(value)
      callback(true)
    },
  } })
  const pending = submitNativeCompatibilityReport().catch(error => error as Error)
  await vi.runAllTimersAsync()
  return { error: await pending, report, capture, captureGeometry, measure }
}

it('reporter只用captureGeometry回传的原生坐标和已落盘三回执', async () => {
  const { report, capture, captureGeometry, measure, error } = await collect()
  expect(error).toBeUndefined()
  expect(captureGeometry.mock.calls[0]!.slice(0, 2)).toEqual([report!.evidence!.runId, 'sizing-fixed'])
  expect(measure.mock.calls.every(([id]) => !id.includes('sizing-fixed'))).toBe(true)
  expect(report!.results[0]).toMatchObject({ status: 'supported', geometry: capture.geometry })
  expect(report!.evidence!.artifacts).toEqual(capture.artifacts)
})

it('旧宿主即使能measure也不能发布没有独立几何落盘的报告', async () => {
  const { report, error } = await collect(true)
  expect(report).toBeUndefined()
  expect(error).toBeInstanceOf(Error)
  expect((error as Error).message).toMatch(/缺少原生几何采集协议/)
})
