import type { CompatibilityCase, NativePlatformReport } from './types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { collectGeometry } from './geometry'
import { submitNativeCompatibilityReport } from './native-reporter'

vi.mock('./catalog', async (importOriginal) => {
  const original = await importOriginal<typeof import('./catalog')>()
  return { ...original, compatibilityCases: original.compatibilityCases.filter(item => item.id === 'flex-direction') }
})

function rect(left: number, top: number, width = 80, height = 40) {
  return { left, top, width, height, right: left + width, bottom: top + height }
}

function measurements(probeLeft = 10, probeTop = 20, controlLeft = 200, controlTop = 300) {
  return {
    'probe-container-flex-direction': rect(probeLeft, probeTop, 160, 160),
    'control-container-flex-direction': rect(controlLeft, controlTop, 160, 160),
    'probe-flex-direction': rect(probeLeft + 6, probeTop + 6),
    'control-flex-direction': rect(controlLeft + 6, controlTop + 6),
    'probe-child-flex-direction-a': rect(probeLeft + 14, probeTop + 30, 12, 12),
    'probe-child-control-flex-direction-a': rect(controlLeft + 14, controlTop + 30, 12, 12),
  }
}

type Measurements = Record<string, ReturnType<typeof rect> | null>

async function collect(boxes: Measurements) {
  vi.useFakeTimers()
  let submitted: NativePlatformReport | undefined
  const measure = vi.fn((id: string, callback: (value: object | null) => void) => {
    // 首屏就绪探针使用独立节点，case 的缺证不能被默认矩形补齐。
    callback(id.includes('layout-aspect') ? rect(0, 0) : boxes[id] ?? null)
  })
  vi.stubGlobal('SystemInfo', { platform: 'Android' })
  vi.stubGlobal('NativeModules', {
    CompatibilityReporter: {
      getEvidenceContext: (callback: (value: object) => void) => callback({ version: 1, runId: '00000000-0000-4000-8000-000000000001', bundleSha256: 'a'.repeat(64) }),
      measure,
      submitArtifact: vi.fn(),
      submit: (_run: string, value: string, callback: (value: boolean) => void) => {
        submitted = JSON.parse(value)
        callback(true)
      },
    },
  })
  const pending = submitNativeCompatibilityReport()
  await vi.runAllTimersAsync()
  await pending
  return { result: submitted!.results[0]!, measured: measure.mock.calls.map(([id]) => id) }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Lynx native geometry evidence', () => {
  it.each([
    [10, 20, 200, 20],
    [10, 20, 10, 300],
    [-80, -160, 190, 450],
  ])('相同内部布局不因两组屏幕原点不同而通过 (%s,%s / %s,%s)', async (...origins) => {
    const { result, measured } = await collect(measurements(...origins))
    expect(result.status).toBe('unsupported')
    expect(result.checkpoints[0]).toMatchObject({ name: 'geometry:probe-vs-control', passed: false })
    expect(measured).toContain('probe-container-flex-direction')
    expect(measured).toContain('control-container-flex-direction')
  })

  it.each(['probe-container-flex-direction', 'control-container-flex-direction', 'probe-child-flex-direction-a', 'probe-child-control-flex-direction-a'])('%s 缺失时记录未测，不能靠位置差异通过', async (id) => {
    const boxes: Measurements = measurements()
    boxes[id] = null
    expect((await collect(boxes)).result.status).toBe('not-tested')
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY])('拒绝非有限原生坐标 %s', async (left) => {
    const boxes = measurements()
    boxes['probe-flex-direction'] = rect(left, 26)
    expect((await collect(boxes)).result.status).toBe('not-tested')
  })

  it('容器尺寸不同不能提供有效的同条件对照', async () => {
    const boxes = measurements()
    boxes['control-container-flex-direction'] = rect(200, 300, 180, 160)
    expect((await collect(boxes)).result.status).toBe('not-tested')
  })

  it('节点的真实局部位移仍然通过，并在 checkpoint 保留相对坐标', async () => {
    const boxes = measurements()
    boxes['probe-flex-direction'] = rect(25, 26)
    boxes['probe-child-flex-direction-a'] = rect(33, 50, 12, 12)
    const { result } = await collect(boxes)
    expect(result.status).toBe('supported')
    expect(result.checkpoints[0]?.actual).toContain('15,6,80,40')
    expect(result.checkpoints[0]?.expected).toContain('6,6,80,40')
  })

  it('子节点在同一 probe 内部的布局变化可观察', async () => {
    const boxes = measurements()
    boxes['probe-child-flex-direction-a'] = rect(50, 50, 12, 12)
    expect((await collect(boxes)).result.status).toBe('supported')
  })

  it('尺寸变化仍可观察，亚像素取整仍遵守已有差异阈值', async () => {
    const changed = measurements()
    changed['probe-flex-direction'] = rect(16, 26, 96, 40)
    expect((await collect(changed)).result.status).toBe('supported')
    const rounded = measurements()
    rounded['probe-flex-direction'] = rect(16.4, 26.4, 80.4, 40.4)
    expect((await collect(rounded)).result.status).toBe('unsupported')
  })
})

it.each([
  ['layout-aspect', 64, 48, 64, 16, 'supported'],
  ['layout-aspect', 72, 48, 72, 16, 'unsupported'],
  ['sizing-fixed', 123, 40, 80, 40, 'supported'],
  ['sizing-fixed', 123, 40, 123, 40, 'unsupported'],
  ['sizing-size', 44, 44, 80, 40, 'supported'],
  ['sizing-size', 72, 44, 80, 40, 'unsupported'],
  ['accessibility-sr', 1, 1, 80, 40, 'supported'],
  ['layout-box-sizing', 96, 64, 116, 84, 'supported'],
  ['layout-box-sizing', 95, 62, 116, 84, 'unsupported'],
  ['layout-box-sizing', 96, 64, 96, 84, 'unsupported'],
  ['sizing-min-max', 120, 240, 40, 300, 'supported'],
  ['sizing-min-max', 40, 240, 40, 300, 'unsupported'],
  ['sizing-min-max', 120, 300, 40, 300, 'unsupported'],
  ['syntax-css-variable', 40, 240, 40, 300, 'supported'],
  ['syntax-css-variable', 40, 200, 40, 300, 'unsupported'],
  ['syntax-css-variable', 40, 240, 40, 280, 'unsupported'],
  ['variant-responsive', 200, 40, 80, 40, 'supported'],
] as const)('%s 的精确几何期望 %s×%s 不能由任意变化替代', async (id, width, height, controlWidth, controlHeight, status) => {
  const boxes = measurements()
  boxes['probe-flex-direction'] = rect(16, 26, width, height)
  boxes['control-flex-direction'] = rect(206, 306, controlWidth, controlHeight)
  const item = { id } as CompatibilityCase
  const result = await collectGeometry(item, async name => boxes[name.replace(id, 'flex-direction') as keyof typeof boxes])
  expect(result.status).toBe(status)
  expect(result.geometry?.probeContainer.left).toBe(10)
  expect(result.geometry?.controlContainer.left).toBe(200)
})
