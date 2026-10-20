import type { EvidenceModule } from './native-evidence'
import type { NativeGeometryCapture } from './native-geometry'
import type { NativePlatformReport } from './types'
import { afterEach, expect, it, vi } from 'vitest'
import { createNativeEvidence } from './native-evidence'
import { geometryArtifactNames, geometryFields } from './native-geometry'

const context = { version: 1 as const, runId: '00000000-0000-4000-8000-000000000001', bundleSha256: 'a'.repeat(64) }
const id = 'sizing-fixed'
afterEach(() => vi.useRealTimers())

function host() {
  const capture: NativeGeometryCapture = {
    geometry: Object.fromEntries(geometryFields.map(field => [field, { left: 2, top: 3, right: 12, bottom: 23, width: 10, height: 20 }])) as unknown as NativeGeometryCapture['geometry'],
    artifacts: geometryArtifactNames(id).map(name => ({ runId: context.runId, name, sha256: 'b'.repeat(64), byteLength: 100 })),
  }
  const reporter = {
    getEvidenceContext: vi.fn<NonNullable<EvidenceModule['getEvidenceContext']>>(callback => callback(context)),
    submitArtifact: vi.fn<NonNullable<EvidenceModule['submitArtifact']>>(),
    captureGeometry: vi.fn<NonNullable<EvidenceModule['captureGeometry']>>((_run, _id, callback) => callback(capture)),
    submit: vi.fn<NonNullable<EvidenceModule['submit']>>((_run, _report, callback) => callback(true)),
  }
  return { reporter, capture }
}

it('从原生采集六矩形与三份落盘回执，不向host上传报告坐标', async () => {
  const { reporter, capture } = host()
  const writer = await createNativeEvidence(reporter)
  await expect(writer.geometry(id)).resolves.toEqual(capture.geometry)
  expect(reporter.captureGeometry.mock.calls[0]!.slice(0, 2)).toEqual([context.runId, id])
  expect(reporter.submitArtifact).not.toHaveBeenCalled()
  await writer.submit({} as NativePlatformReport)
  expect(JSON.parse(reporter.submit.mock.calls[0]![1]).evidence).toEqual({ ...context, artifacts: capture.artifacts })
})

it.each(['missing-sidecar', 'duplicate-receipt', 'wrong-run', 'wrong-name', 'bad-hash', 'empty', 'missing-rect', 'invalid-corners', 'missing-host'] as const)('拒绝 %s 并阻止报告发布', async (mode) => {
  const { reporter, capture } = host()
  if (mode === 'missing-sidecar') {
    capture.artifacts.pop()
  }
  if (mode === 'duplicate-receipt') {
    capture.artifacts[2] = { ...capture.artifacts[0]! }
  }
  if (mode === 'wrong-run') {
    capture.artifacts[0]!.runId = 'another-run'
  }
  if (mode === 'wrong-name') {
    capture.artifacts[0]!.name = '../other.png'
  }
  if (mode === 'bad-hash') {
    capture.artifacts[0]!.sha256 = 'bad'
  }
  if (mode === 'empty') {
    capture.artifacts[0]!.byteLength = 0
  }
  if (mode === 'missing-rect') {
    delete (capture.geometry as Partial<typeof capture.geometry>).probeChild
  }
  if (mode === 'invalid-corners') {
    capture.geometry.probe.right = 13
  }
  const writer = await createNativeEvidence(mode === 'missing-host' ? { ...reporter, captureGeometry: undefined } : reporter)
  await expect(writer.geometry(id)).rejects.toThrow()
  await expect(writer.submit({} as NativePlatformReport)).rejects.toThrow(/已失败/)
  expect(reporter.submit).not.toHaveBeenCalled()
})

it('磁盘失败与重复采集都不能发布部分证据', async () => {
  const { reporter } = host()
  reporter.captureGeometry.mockImplementationOnce((_run, _id, callback) => callback(null))
  const failed = await createNativeEvidence(reporter)
  await expect(failed.geometry(id)).rejects.toThrow(/几何或落盘清单无效/)
  await expect(failed.submit({} as NativePlatformReport)).rejects.toThrow(/已失败/)
  const duplicate = await createNativeEvidence(reporter)
  await duplicate.geometry(id)
  await expect(duplicate.geometry(id)).rejects.toThrow(/回执无效/)
  await expect(duplicate.submit({} as NativePlatformReport)).rejects.toThrow(/已失败/)
})

it('采集等待与超时后的迟到原生回执不能发布成功报告', async () => {
  vi.useFakeTimers()
  const { reporter, capture } = host()
  let complete: ((value: NativeGeometryCapture | null) => void) | undefined
  reporter.captureGeometry.mockImplementation((_run, _id, callback) => {
    complete = callback
  })
  const writer = await createNativeEvidence(reporter)
  const pending = writer.geometry(id).catch(error => error as Error)
  await expect(writer.submit({} as NativePlatformReport)).rejects.toThrow(/未全部确认/)
  await vi.advanceTimersByTimeAsync(5001)
  expect(await pending).toMatchObject({ message: expect.stringContaining('超时') })
  complete!(capture)
  await expect(writer.submit({} as NativePlatformReport)).rejects.toThrow(/已失败/)
})
