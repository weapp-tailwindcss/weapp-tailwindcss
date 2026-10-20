import type { LifecycleEvent, LifecycleObservation, LifecycleValues } from './tailwind-capabilities/web-lifecycle/types'
import { expect, it } from 'vitest'
import { assertionPassed } from './tailwind-capabilities/report'
import { lifecycleAssertions, lifecycleWebContract, naturalStartingTimeline } from './tailwind-capabilities/web-lifecycle/contract'
import { lifecycleFixtureUrl, lifecycleWebProbes, renderLifecycleProbe } from './tailwind-capabilities/web-lifecycle/fixtures'

const runId = 'lifecycle-contract-run'
const channels = ['red', 'green', 'blue', 'alpha'] as const
const colors = { white: [255, 255, 255, 255], active: [18, 52, 86, 255], middle: [137, 154, 171, 255] } as const

function pixel(id: string, rgba: readonly number[]) {
  return { id, x: 100, y: 50, rgba: [...rgba] as [number, number, number, number] }
}

function observation(id: LifecycleObservation['id']): LifecycleObservation {
  return { id, runId, url: lifecycleFixtureUrl(runId, id), values: {}, events: [], pixels: {}, restoration: {} }
}

function goldStarting() {
  const result = observation('lifecycle-starting')
  result.frames = [
    { cycle: 1, time: 0, probe: 0, control: 1 },
    { cycle: 1, time: 16, probe: 16 / 1200, control: 1 },
    { cycle: 1, time: 120, probe: 0.1, control: 1 },
    { cycle: 1, time: 600, probe: 0.5, control: 1 },
    { cycle: 1, time: 1200, probe: 1, control: 1 },
    { cycle: 2, time: 2000, probe: 0, control: 1 },
    { cycle: 2, time: 2120, probe: 0.1, control: 1 },
    { cycle: 2, time: 2240, probe: 0.2, control: 1 },
  ].map(frame => ({ ...frame, animation: {
    identity: frame.cycle,
    native: true,
    target: 'probe',
    targetMatches: true,
    documentTimeline: true,
    property: 'opacity',
    registered: frame.probe < 1,
    matches: frame.probe < 1 ? 1 : 0,
    currentTime: frame.probe * 1200,
    startTime: frame.cycle === 1 ? 0 : 2000,
    timelineTime: frame.time,
    playState: frame.probe === 1 ? 'finished' : 'running',
    pending: false,
    duration: 1200,
    playbackRate: 1,
    delay: 0,
    endDelay: 0,
    iterations: 1,
    iterationStart: 0,
    direction: 'normal',
    easing: 'linear',
    keyframes: [{ computedOffset: 0, opacity: '0', easing: 'linear' }, { computedOffset: 1, opacity: '1', easing: 'linear' }],
  } }))
  result.events = [1, 2].flatMap(cycle => ['transitionrun', 'transitionstart', 'transitionend'].map((type, index): LifecycleEvent => ({ type, target: 'probe', trusted: true, time: cycle * 2000 + index * 100, cycle, phase: index === 2 && cycle === 2 ? 'restoration' : 'natural', property: 'opacity', pseudoElement: '', elapsedTime: index === 2 ? 1.2 : 0 })))
  const snapshots = ['start', 'middle', 'end'].map((stage, index) => {
    const state = { identity: 2, native: true, registered: true, target: 'probe', property: 'opacity', duration: 1200, playbackRate: 1, playState: index === 2 ? 'finished' : 'paused', currentTime: index * 600, probeOpacity: index * 0.5, controlOpacity: 1 }
    result.pixels[stage] = [pixel('probe', [colors.white, colors.middle, colors.active][index]!), pixel('control', colors.active)]
    return { stage, before: { ...state }, after: { ...state } }
  })
  result.restoration = { restoredFrom: { identity: 2, duration: 1200, currentTime: 240 }, snapshots, finalSnapshot: snapshots[2]!.after, finalOpacity: 1 }
  return result
}

function goldDetails() {
  const result = observation('lifecycle-details-content')
  result.values['supports/details-content'] = true
  const steps = [['initial', false, 'none'], ['click-open', true, 'click'], ['click-close', false, 'click'], ['keyboard-open', true, 'keyboard'], ['restored', false, 'keyboard']] as const
  result.restoration = { restored: true, steps: steps.map(([stage, open, input], index) => {
    const values: LifecycleValues = { [`${stage}/open`]: open, [`${stage}/control-open`]: open, [`${stage}/pseudo-background`]: 'rgb(18, 52, 86)', [`${stage}/pseudo-content-visibility`]: open ? 'visible' : 'hidden', [`${stage}/content-background`]: 'rgba(0, 0, 0, 0)', [`${stage}/control-pseudo-background`]: 'rgba(0, 0, 0, 0)' }
    if (input !== 'none') {
      for (const id of ['probe', 'control']) {
        result.events.push({ type: input === 'click' ? 'pointerdown' : 'keydown', target: `${id}-summary`, trusted: true, time: index * 100, step: stage, key: input === 'keyboard' ? 'Enter' : '' }, { type: 'click', target: `${id}-summary`, trusted: true, time: index * 100 + 1, step: stage }, { type: 'toggle', target: id, trusted: true, time: index * 100 + 2, step: stage, oldState: open ? 'closed' : 'open', newState: open ? 'open' : 'closed' })
      }
    }
    result.pixels[stage] = [pixel('probe-content', open ? colors.active : colors.white), pixel('control-content', colors.white), pixel('probe-summary', colors.white), pixel('control-summary', colors.white)]
    return { stage, values, probeRect: { height: open ? 96 : 32 }, controlRect: { height: open ? 96 : 32 } }
  }) }
  return result
}

function assertions(result: LifecycleObservation) {
  const probe = lifecycleWebProbes.find(probe => probe.id === result.id)!
  return lifecycleAssertions(lifecycleWebContract(probe, runId), result, true)
}

it.each([goldStarting, goldDetails])('完整原始事件、恢复与像素满足独立生命周期合同', (fixture) => {
  expect(assertions(fixture()).filter(assertion => !assertionPassed(assertion))).toEqual([])
})

it.each(['frames', 'events', 'pixels', 'restoration'] as const)('删除 starting 原始 %s 不能用缓存成功值放行', (field) => {
  const result = goldStarting()
  result.values = Object.fromEntries(assertions(result).map(assertion => [assertion.name, assertion.actual]))
  if (field === 'frames' || field === 'events') {
    result[field] = []
  }
  else {
    result[field] = {}
  }
  expect(assertions(result).some(assertion => !assertionPassed(assertion))).toBe(true)
})

it('自然时间线从渲染开始采样，保留插入时尚未刷新样式的原始记录', () => {
  const result = goldStarting()
  result.frames!.unshift({ cycle: 1, time: -1, probe: 1, control: 1, phase: 'insertion' })
  expect(assertions(result).filter(assertion => !assertionPassed(assertion))).toEqual([])
  result.frames!.splice(3, 0, { cycle: 1, time: 17, probe: 1, control: 1, phase: 'insertion' })
  expect(assertions(result).find(assertion => assertion.name === 'natural/first')?.actual).toBe(false)
})

it('原生事件接受秒数的浮点序列化及同一 transition 回拨产生的 start 事件', () => {
  const result = goldStarting()
  result.events.filter(event => event.type === 'transitionend').forEach(event => event.elapsedTime = 1.2000000476837158)
  result.events.splice(
    5,
    0,
    { type: 'transitionstart', target: 'probe', trusted: true, time: 4201, cycle: 2, phase: 'evidence', property: 'opacity', pseudoElement: '', elapsedTime: 0 },
    { type: 'transitionstart', target: 'probe', trusted: true, time: 4202, cycle: 2, phase: 'restoration', property: 'opacity', pseudoElement: '', elapsedTime: 0 },
  )
  expect(assertions(result).filter(assertion => !assertionPassed(assertion))).toEqual([])
  result.events[5]!.type = 'transitionrun'
  expect(assertions(result).find(assertion => assertion.name === 'native/transition-events')?.actual).toBe(false)
})

it.each(['events', 'pixels', 'restoration'] as const)('删除 details 原始 %s 不能用缓存成功值放行', (field) => {
  const result = goldDetails()
  result.values = Object.fromEntries(assertions(result).map(assertion => [assertion.name, assertion.actual]))
  if (field === 'events') {
    result.events = []
  }
  else {
    result[field] = {}
  }
  expect(assertions(result).some(assertion => !assertionPassed(assertion))).toBe(true)
})

it('静止、逆行、缺少重插及只有终点的时间线均不通过', () => {
  for (const values of [[1, 1, 1], [0, 0.8, 0.2, 1], [0, 1], [0, 0, 0]]) {
    expect(naturalStartingTimeline(values.map((probe, index) => ({ cycle: 1, time: index * 10, probe, control: 1 })), 1, true)).toBe(false)
  }
  const result = goldStarting()
  result.frames = result.frames!.filter(frame => frame.cycle === 1)
  expect(assertions(result).find(assertion => assertion.name === 'natural/reinserted')?.actual).toBe(false)
})

it.each(['wrong-color', 'control-color', 'event-phase', 'event-order', 'untrusted', 'animation-replaced', 'animation-fast-forwarded', 'paused-other-animation', 'restore-missing'] as const)('starting 反例必须失败：%s', (mutation) => {
  const result = goldStarting()
  if (mutation === 'wrong-color') {
    result.pixels.middle![0]!.rgba = [18, 52, 86, 255]
  }
  if (mutation === 'control-color') {
    result.pixels.start![1]!.rgba = [255, 255, 255, 255]
  }
  if (mutation === 'event-phase') {
    result.events.at(-1)!.phase = 'evidence'
  }
  if (mutation === 'event-order') {
    result.events.reverse()
  }
  if (mutation === 'untrusted') {
    result.events[0]!.trusted = false
  }
  const restoration = result.restoration as { snapshots: Array<{ after: Record<string, unknown> }>, finalSnapshot: Record<string, unknown> }
  if (mutation === 'animation-replaced') {
    restoration.snapshots[0]!.after.native = false
  }
  if (mutation === 'animation-fast-forwarded') {
    restoration.snapshots[1]!.after.currentTime = 1200
  }
  if (mutation === 'paused-other-animation') {
    restoration.snapshots[1]!.after.identity = 1
  }
  if (mutation === 'restore-missing') {
    restoration.finalSnapshot.playState = 'paused'
  }
  expect(assertions(result).some(assertion => !assertionPassed(assertion))).toBe(true)
})

it.each(['old-toggle', 'classless-unopened', 'summary-colored', 'content-painted-closed', 'layout-not-restored', 'pseudo-state-missing'] as const)('details 反例必须失败：%s', (mutation) => {
  const result = goldDetails()
  const steps = result.restoration.steps as Array<{ stage: string, values: LifecycleValues, probeRect: { height: number } }>
  if (mutation === 'old-toggle') {
    result.events.filter(event => event.step === 'keyboard-open').forEach(event => event.step = 'click-open')
  }
  if (mutation === 'classless-unopened') {
    steps[1]!.values['click-open/control-open'] = false
  }
  if (mutation === 'summary-colored') {
    result.pixels['click-open']![2]!.rgba = [18, 52, 86, 255]
  }
  if (mutation === 'content-painted-closed') {
    result.pixels['click-close']![0]!.rgba = [18, 52, 86, 255]
  }
  if (mutation === 'layout-not-restored') {
    steps.at(-1)!.probeRect.height = 96
  }
  if (mutation === 'pseudo-state-missing') {
    delete steps[1]!.values['click-open/pseudo-content-visibility']
  }
  expect(assertions(result).some(assertion => !assertionPassed(assertion))).toBe(true)
})

it('同轮 URL、run ID 和独立像素预期不可从实际输出反推', () => {
  const result = goldStarting()
  result.runId = 'stale-run'
  result.url = lifecycleFixtureUrl('stale-run', result.id)
  expect(assertions(result).filter(assertion => !assertionPassed(assertion)).map(assertion => assertion.name)).toEqual(['fixture/run-id', 'fixture/url'])
  const contract = lifecycleWebContract(lifecycleWebProbes[0], runId)
  expect(channels.map(channel => contract.expectedValues[`middle/pixel/probe/${channel}`])).toEqual([137, 154, 171, 255])
  expect(() => lifecycleFixtureUrl('', result.id)).toThrow('run ID')
  const html = renderLifecycleProbe(lifecycleWebProbes[0], 'generated-only', runId)
  expect(html).toContain('starting:opacity-0')
  expect(html).not.toContain('@starting-style')
})
