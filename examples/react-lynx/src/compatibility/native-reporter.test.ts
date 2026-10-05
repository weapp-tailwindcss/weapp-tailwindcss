import type { NativePlatformReport } from './types'
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
    ].includes(item.id)),
  }
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function collect(options: { missingFrame?: boolean } = {}) {
  vi.useFakeTimers()
  const captures: string[] = []
  const mutations: string[] = []
  const states = new Map<string, number>()
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
      measure: (_id: string, callback: (rect: object) => void) => callback({ width: 64, height: 48 }),
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
      submit: (value: string) => { submitted = JSON.parse(value) },
      submitArtifact: vi.fn(),
    },
  })
  const pending = submitNativeCompatibilityReport()
  await vi.runAllTimersAsync()
  await pending
  return { report: submitted!, captures, mutations }
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
  expect(report.results.every(result => result.status === 'supported')).toBe(true)
})

it('合成画布缺失时保持未验收，不退回元素自身截图', async () => {
  const { report, captures } = await collect({ missingFrame: true })
  expect(captures.every(id => id.includes('-container-'))).toBe(true)
  expect(report.results.every(result => result.status === 'not-tested')).toBe(true)
})
