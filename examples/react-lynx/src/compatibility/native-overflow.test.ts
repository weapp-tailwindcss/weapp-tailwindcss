import type { EvidenceModule } from './native-evidence'
import type { NativePlatformReport, NativeRect } from './types'
import { afterEach, expect, it, vi } from 'vitest'
import { geometryArtifactNames } from './native-geometry'
import { submitNativeCompatibilityReport } from './native-reporter'
import { mediaCapture } from './test-utils/native-media'

// 主题控制器的状态与失败恢复由 native-theme-overrides.test.ts 独立验证；此处隔离原有 reporter 维度。
vi.mock('./native-theme-overrides', () => ({ collectThemeOverrides: vi.fn(async () => ({ contract: 'lynx-theme-overrides-v1', frames: [] })) }))

vi.mock('./catalog', async (importOriginal) => {
  const original = await importOriginal<typeof import('./catalog')>()
  return { ...original, compatibilityCases: original.compatibilityCases.filter(item => item.id === 'layout-overflow') }
})
vi.mock('./static-evidence.json', () => ({ default: { catalogHash: 'protocol-test', versions: {}, results: [{ id: 'layout-overflow', generated: true, bundled: true }] } }))
afterEach(() => vi.unstubAllGlobals())

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height })
const geometry = {
  probeContainer: rect(0, 0, 160, 160),
  controlContainer: rect(0, 200, 160, 160),
  probe: rect(12, 12, 96, 64),
  control: rect(12, 212, 96, 64),
  probeChild: rect(84, 52, 48, 40),
  controlChild: rect(84, 252, 48, 40),
}

async function collect(missingProtocol = false) {
  const runId = '00000000-0000-4000-8000-000000000001'
  let report: NativePlatformReport | undefined
  const captured: string[] = []
  const fail = vi.fn((_run, _message, callback) => callback(true))
  vi.stubGlobal('SystemInfo', { platform: 'Android' })
  const reporter: EvidenceModule & { measure: (id: string, callback: (value: NativeRect) => void) => void } = {
    getEvidenceContext: callback => callback({ version: 1, runId, bundleSha256: 'a'.repeat(64) }),
    captureMediaGate: (_run, callback) => callback(mediaCapture()),
    measure: (_id, callback) => callback(rect(0, 0, 64, 48)),
    captureGeometry: missingProtocol
      ? undefined
      : (_run, id, callback) => {
          captured.push(id)
          callback({ geometry, artifacts: geometryArtifactNames(id).map(name => ({ name, runId, sha256: 'b'.repeat(64), byteLength: 128 })) })
        },
    submitArtifact: vi.fn(),
    submit: (_run, json, callback) => {
      report = JSON.parse(json)
      callback(true)
    },
    fail,
  }
  vi.stubGlobal('NativeModules', { CompatibilityReporter: reporter })
  const error = await submitNativeCompatibilityReport().catch(error => error as Error)
  return { report, captured, error, fail }
}

it('overflow 原生采集只保留独立几何与落盘回执，截图存在不能提前自报支持', async () => {
  const { report, captured, error } = await collect()
  expect(error).toBeUndefined()
  expect(captured).toEqual(['layout-overflow'])
  expect(report!.results).toMatchObject([{ id: 'layout-overflow', status: 'not-tested', geometry, checkpoints: [{ name: 'pixel:overflow-clip-v1', passed: false }] }])
  expect(report!.evidence!.artifacts.map(item => item.name)).toEqual(expect.arrayContaining(geometryArtifactNames('layout-overflow')))
})

it('原生几何协议缺失时阻断，禁止回退到节点截图指纹', async () => {
  const { report, error, fail } = await collect(true)
  expect(report).toBeUndefined()
  expect(error).toBeInstanceOf(Error)
  expect(fail).toHaveBeenCalledOnce()
})
