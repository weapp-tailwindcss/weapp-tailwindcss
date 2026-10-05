import type { NativeArtifactReceipt, NativeColorSchemeReceipt, NativePlatformReport } from './types'
import { afterEach, expect, it, vi } from 'vitest'
import { submitNativeCompatibilityReport } from './native-reporter'

vi.mock('./catalog', async (importOriginal) => {
  const original = await importOriginal<typeof import('./catalog')>()
  return {
    ...original,
    compatibilityCases: original.compatibilityCases.filter(item => [
      'layout-visibility',
      'border-width-color',
      'effect-opacity',
      'variant-state',
      'animation-spin',
      'transition-basic',
      'background-linear-gradient',
      'effect-shadow',
      'transform-skew',
      'variant-dark',
    ].includes(item.id)),
  }
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function collect(options: { missingFrame?: boolean, restoreFailed?: boolean, receipt?: 'late' | 'wrong-run' | 'missing' | 'failed' } = {}) {
  vi.useFakeTimers()
  const runId = '00000000-0000-4000-8000-000000000001'
  const captures: string[] = []
  const mutations: string[] = []
  const measurements: string[] = []
  const states = new Map<string, number>()
  let schemeRequests = 0
  let submitted: NativePlatformReport | undefined
  vi.stubGlobal('SystemInfo', { platform: 'Android' })
  vi.stubGlobal('lynx', {
    createSelectorQuery: () => ({
      select: (selector: string) => ({
        setNativeProps: () => { mutations.push(selector) },
      }),
      exec: () => {},
    }),
  })
  vi.stubGlobal('NativeModules', {
    CompatibilityReporter: {
      getEvidenceContext: (callback: (value: object) => void) => callback({ version: 1, runId, bundleSha256: 'a'.repeat(64) }),
      setColorScheme: (run: string, requestId: string, scheme: 'light' | 'dark', callback: (value: NativeColorSchemeReceipt | null) => void) => {
        callback(++schemeRequests === 3 && options.restoreFailed ? null : { runId: run, requestId, scheme })
      },
      captureColorScheme: (_run: string, _requestId: string, id: string, callback: (image: string | null) => void) => {
        captures.push(id)
        callback(options.missingFrame ? null : `native-color-scheme:${id}`)
      },
      measure: (id: string, callback: (rect: object) => void) => {
        measurements.push(id)
        callback({ width: 64, height: 48 })
      },
      capture: (id: string, callback: (image: string | null) => void) => {
        captures.push(id)
        if (!id.includes('-container-') || options.missingFrame) {
          callback(null)
          return
        }
        const frame = states.get(id) ?? 0
        states.set(id, frame + 1)
        callback(`native-composited-image:${id}:${frame}`)
      },
      setPseudoActive: (id: string, active: boolean, callback: (result: boolean) => void) => {
        mutations.push(`${id}:${active}`)
        callback(true)
      },
      submit: (_run: string, value: string, callback: (value: boolean) => void) => {
        submitted = JSON.parse(value)
        callback(true)
      },
      submitArtifact: (_run: string, name: string, _data: string, callback: (value: NativeArtifactReceipt | null) => void) => {
        const receipt = { runId, name, sha256: 'b'.repeat(64), byteLength: 128 }
        if (options.receipt === 'missing') {
          return
        }
        if (options.receipt === 'failed') {
          callback(null)
          return
        }
        if (options.receipt === 'wrong-run') {
          receipt.runId = '00000000-0000-4000-8000-000000000002'
        }
        if (options.receipt === 'late') {
          setTimeout(() => {
            expect(submitted).toBeUndefined()
            callback(receipt)
          }, 1500)
        }
        else {
          callback(receipt)
        }
      },
    },
  })
  const pending = submitNativeCompatibilityReport().catch(error => error as Error)
  await vi.runAllTimersAsync()
  const error = await pending
  return { report: submitted!, captures, measurements, mutations, error }
}

it('透明度、可见性与边框对照都采集父级合成画布', async () => {
  const { report, captures } = await collect()
  for (const id of ['layout-visibility', 'effect-opacity', 'border-width-color']) {
    expect(captures).toContain(`probe-container-${id}`)
    expect(captures).toContain(`control-container-${id}`)
    expect(captures).not.toContain(`probe-${id}`)
    expect(report.results.find(result => result.id === id)?.status).toBe('supported')
  }
})

it('动画及 transition 全部采集稳定画布，状态变化仍作用于被测节点', async () => {
  const { report, captures, mutations } = await collect()
  expect(captures.filter(id => id === 'probe-container-animation-spin')).toHaveLength(2)
  expect(captures.filter(id => id === 'probe-container-transition-basic')).toHaveLength(3)
  expect(captures.filter(id => id === 'probe-container-variant-state')).toHaveLength(2)
  expect(mutations).toEqual(['#probe-transition-basic', 'probe-variant-state:true', 'probe-variant-state:false'])
  expect(report.results.filter(result => !['background-linear-gradient', 'effect-shadow', 'transform-skew', 'variant-dark'].includes(result.id)).every(result => result.status === 'supported')).toBe(true)
})

it('合成画布缺失时拒绝发布报告，不退回元素自身截图', async () => {
  const { report, captures, error } = await collect({ missingFrame: true })
  expect(captures.every(id => id.includes('-container-'))).toBe(true)
  expect(report).toBeUndefined()
  expect(error instanceof Error ? error.message : undefined).toMatch(/截图缺失/)
})

it('等待最后一帧的真实写入回执后才发布报告', async () => {
  const { report, error } = await collect({ receipt: 'late' })
  expect(error).toBeUndefined()
  expect(report.evidence?.artifacts).toHaveLength(23)
})

it.each(['wrong-run', 'missing', 'failed'] as const)('%s 回执禁止发布报告', async (receipt) => {
  const { report, error } = await collect({ receipt })
  expect(report).toBeUndefined()
  expect(error).toBeInstanceOf(Error)
})

it('渐变、阴影和 Canvas skew 指纹不同也仅提交待宿主判定的原始截图', async () => {
  const { report } = await collect()
  for (const id of ['background-linear-gradient', 'effect-shadow', 'transform-skew']) {
    expect(report.results.find(result => result.id === id)).toMatchObject({ status: 'not-tested', reason: expect.stringContaining('预期效果') })
    expect(report.evidence?.artifacts.filter(item => item.name.startsWith(id))).toHaveLength(2)
  }
})

it('Canvas skew 不从 View 矩阵得出支持结论，而是绑定两张父级截图', async () => {
  const { report, captures, measurements } = await collect()
  expect(measurements.some(id => id.includes('transform-skew'))).toBe(false)
  expect(captures.filter(id => id.includes('transform-skew'))).toEqual(['probe-container-transform-skew', 'control-container-transform-skew'])
  expect(report.results.find(item => item.id === 'transform-skew')).toMatchObject({ status: 'not-tested' })
})

it('dark 报告包含四帧与恢复回执，恢复失败不得提交任何报告', async () => {
  const { report } = await collect()
  expect(report.results.find(item => item.id === 'variant-dark')).toMatchObject({ status: 'not-tested', colorScheme: { restored: { scheme: 'light', runId: report.evidence!.runId } } })
  expect(report.evidence!.artifacts.filter(item => item.name.startsWith('variant-dark')).map(item => item.name)).toEqual([
    'variant-dark-light-probe.png',
    'variant-dark-light-control.png',
    'variant-dark-dark-probe.png',
    'variant-dark-dark-control.png',
  ])
  const failed = await collect({ restoreFailed: true })
  expect(failed.error).toBeInstanceOf(AggregateError)
  expect(failed.report).toBeUndefined()
})
