import type { Page } from 'playwright'
import type { SemanticAssertion } from './tailwind-capabilities/types'
import type { WebObservation } from './tailwind-capabilities/web/actions'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { assertionPassed } from './tailwind-capabilities/report'
import { activateProbe, prepareProbe, readProbe } from './tailwind-capabilities/web/actions'
import { webContract, webRuntimeAssertions, webRuntimeOutcome } from './tailwind-capabilities/web/contract'
import { applyControl } from './tailwind-capabilities/web/controls'
import { pseudoVariantProbes } from './tailwind-capabilities/web/variants/pseudo'

const focus = pseudoVariantProbes.find(probe => probe.id === 'controlled-focus-visible')!
const contrast = pseudoVariantProbes.find(probe => probe.id === 'controlled-contrast-more')!

function assertions(changes: Partial<WebObservation> = {}, generated = true) {
  return [
    { name: 'generated', stage: 'generation' as const, actual: generated, expected: true },
    ...['before', 'after', 'restored'].flatMap(state => webRuntimeAssertions(contrast, state, {
      actual: state === 'after' ? contrast.expected : contrast.before!,
      guards: Object.fromEntries(contrast.guards!.map(guard => [guard.name, state === 'after' ? guard.expected : guard.before ?? guard.expected])),
      renderFrames: [10, 20],
      ...(state === 'after' ? changes : {}),
    })),
  ] satisfies SemanticAssertion[]
}

describe('真实键盘与媒体环境的观测边界', () => {
  it('contrast 协议通过真实 viewport 重算媒体样式并恢复原尺寸，不能只看 matchMedia', async () => {
    const calls: unknown[] = []
    const page = {
      emulateMedia: async (options: unknown) => { calls.push(options) },
      viewportSize: () => ({ width: 640, height: 480 }),
      setViewportSize: async (size: unknown) => { calls.push(size) },
    } as unknown as Page
    await applyControl(page, contrast.controls![0]!, true)
    expect(calls).toEqual([{ contrast: 'more' }, { width: 641, height: 480 }, { width: 640, height: 480 }])
  })
  it('键盘夹具采用跨平台可Tab导航的文本输入，并单独证明focus和focus-visible', async () => {
    expect(focus.html).toContain('<input id="anchor" type="text"')
    expect(focus.html).toContain('<input id="probe" type="text"')
    expect(focus.guards).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'matches', condition: ':focus', before: 'false', expected: 'true' }),
      expect.objectContaining({ kind: 'matches', condition: ':focus-visible', before: 'false', expected: 'true' }),
    ]))
    const log: string[] = []
    const page = {
      locator: (selector: string) => ({
        focus: async () => { log.push(`${selector}/focus`) },
        blur: async () => { log.push(`${selector}/blur`) },
      }),
      keyboard: { press: async (key: string) => { log.push(`keyboard/${key}`) } },
    } as unknown as Page
    const cleanup = await prepareProbe(page, focus)
    const restore = await activateProbe(page, focus)
    await restore()
    await cleanup()
    expect(log).toEqual(['#probe/blur', '#anchor/focus', 'keyboard/Tab', '#probe/blur', '#probe/blur'])
  })

  it('contrast夹具有不依赖Tailwind类名的原生CSS与候选比较，契约要求真实渲染检查点', () => {
    expect(contrast.html).toContain('@media (prefers-contrast: more)')
    expect(contrast.html).toContain('#contrast-native { opacity: .5; }')
    expect(contrast.guards).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'style', selector: '#contrast-native', property: 'opacity', before: '1', expected: '0.5', environment: true }),
      expect.objectContaining({ kind: 'compare-style', selector: '#probe', reference: '#contrast-native', property: 'opacity', expected: 'true' }),
    ]))
    expect(webContract(contrast).requiredAssertions).toContain('after/render-checkpoint')
    expect(assertions().every(assertionPassed)).toBe(true)
  })

  it('原生媒体也无效果而候选一致时记录环境blocked，不能声明unsupported或passed', () => {
    const checks = assertions({ actual: '1', guards: { 'native-contrast': 'true', 'native-contrast-reference': '1', 'native-style-match': 'true' } })
    expect(webRuntimeOutcome(contrast, checks)).toMatchObject({ status: 'blocked', reason: expect.stringContaining('native-contrast-reference') })
  })

  it.each([
    ['候选与有效原生声明不同', '0.7', '0.5'],
    ['原生无效但候选不同', '0.5', '1'],
  ])('%s仍是failed，不能被环境阻塞掩盖', (_name, actual, reference) => {
    const checks = assertions({ actual, guards: { 'native-contrast': 'true', 'native-contrast-reference': reference, 'native-style-match': 'false' } })
    expect(webRuntimeOutcome(contrast, checks).status).toBe('failed')
  })

  it('生成丢失、缺少独立比较或无渲染检查点都不能被归为环境阻塞', () => {
    const nativeFailure = { actual: '1', guards: { 'native-contrast': 'true', 'native-contrast-reference': '1', 'native-style-match': 'true' } }
    expect(webRuntimeOutcome(contrast, assertions(nativeFailure, false)).status).toBe('failed')
    expect(webRuntimeOutcome(contrast, assertions(nativeFailure).filter(item => item.name !== 'after/guard/native-style-match')).status).toBe('failed')
    for (const renderFrames of [[], [10, 10], [Number.NaN, 20]]) {
      expect(webRuntimeOutcome(contrast, assertions({ ...nativeFailure, renderFrames })).status).toBe('failed')
    }
    expect(webRuntimeOutcome(contrast, assertions()).status).toBe('passed')
  })

  it('媒体读取在两个真实rAF之后取样，保留原生computed、matchMedia和帧时间', async () => {
    let callback = ''
    let input: unknown
    const page = { locator: () => ({ evaluate: async (read: () => unknown, argument: unknown) => {
      callback = String(read)
      input = argument
    } }) } as unknown as Page
    await readProbe(page, contrast)
    const log: string[] = []
    let time = 0
    const element = { attributes: [], getAttribute: () => contrast.candidate, getBoundingClientRect: () => ({ width: 80, height: 48, top: 32, left: 32 }) }
    const realm = {
      element,
      input,
      setTimeout,
      clearTimeout,
      cancelAnimationFrame: () => {},
      requestAnimationFrame: (next: (time: number) => void) => {
        log.push('frame')
        next(time += 10)
      },
      document: { querySelector: () => element },
      window: {
        scrollX: 0,
        scrollY: 0,
        getComputedStyle: () => {
          log.push('style')
          return { getPropertyValue: () => '0.5' }
        },
        matchMedia: () => ({ matches: true }),
      },
    }
    const result = await runInNewContext(`(${callback})(element, input)`, realm)
    expect(log.slice(0, 3)).toEqual(['frame', 'frame', 'style'])
    expect(result).toMatchObject({ actual: '0.5', renderFrames: [10, 20], guards: { 'native-contrast': 'true', 'native-contrast-reference': '0.5', 'native-style-match': 'true' } })
    const cancelled: number[] = []
    await expect(runInNewContext(`(${callback})(element, input)`, {
      ...realm,
      requestAnimationFrame: () => 7,
      cancelAnimationFrame: (frame: number) => { cancelled.push(frame) },
      setTimeout: (next: () => void) => { void Promise.resolve().then(next) },
    })).rejects.toThrow('未在5秒内完成两个渲染帧')
    expect(cancelled).toEqual([7])
  })
})
