import type { LifecycleEvent, LifecycleObservation, LifecycleValues, StartingFrame } from './types'

const channels = ['red', 'green', 'blue', 'alpha'] as const

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/** 自然帧允许重复进度，但必须有多次严格递增并覆盖中段。 */
export function naturalStartingTimeline(frames: readonly StartingFrame[], cycle: number, completed: boolean) {
  const raw = frames.filter(frame => frame.cycle === cycle)
  // 同步插入时 Firefox 尚未提交 starting 样式；原始值保留，但不能当作已渲染帧。
  if (raw.some((frame, index) => frame.phase === 'insertion' && (index !== 0 || !Number.isFinite(frame.time) || frame.control !== 1))) {
    return false
  }
  const selected = raw.filter(frame => frame.phase !== 'insertion')
  return selected.length >= 3
    && selected.every((frame, index) => Number.isFinite(frame.time) && Number.isFinite(frame.probe) && frame.control === 1 && frame.probe >= 0 && frame.probe <= 1 && (!index || (frame.time >= selected[index - 1]!.time && frame.probe >= selected[index - 1]!.probe)))
    && selected.at(-1)!.time > selected[0]!.time
    && selected[0]!.probe <= 0.02
    && selected.some(frame => frame.probe > 0.05 && frame.probe < 0.95)
    && selected.filter((frame, index) => index > 0 && frame.probe > selected[index - 1]!.probe).length >= 2
    && (!completed || selected.at(-1)!.probe === 1)
}

function nativeTransition(events: readonly LifecycleEvent[], cycle: number) {
  const raw = events.filter(event => event.cycle === cycle && event.target === 'probe' && event.property === 'opacity')
  // WebKit 对同一 transition 回拨到零、再恢复自然时间时会重新派发 start。
  const seeks = raw.filter(event => event.type === 'transitionstart' && event.phase !== 'natural')
  if (seeks.some(event => cycle !== 2 || !['evidence', 'restoration'].includes(event.phase ?? '') || event.elapsedTime !== 0)) {
    return false
  }
  const selected = raw.filter(event => !seeks.includes(event))
  if (selected.length !== 3 || raw.some(event => !event.trusted || event.pseudoElement !== '')) {
    return false
  }
  return ['transitionrun', 'transitionstart', 'transitionend'].every((type, index) => {
    const event = selected[index]!
    // TransitionEvent.elapsedTime 在 Firefox 经 float32 序列化，误差上限为一微秒。
    return event.type === type && event.phase === (index === 2 && cycle === 2 ? 'restoration' : 'natural') && typeof event.elapsedTime === 'number' && Math.abs(event.elapsedTime - (index === 2 ? 1.2 : 0)) <= 0.000001
  })
}

/** 从原始帧、事件、像素与恢复记录重算判定，禁止空证据配合缓存布尔值放行。 */
export function lifecycleRawValues(observation: LifecycleObservation): LifecycleValues {
  const values: LifecycleValues = {}
  for (const name of Object.keys(observation.values).filter(name => name.includes('/pixel/'))) {
    values[name] = null
  }
  for (const [stage, pixels] of Object.entries(observation.pixels)) {
    for (const pixel of pixels) {
      for (const [index, channel] of channels.entries()) {
        values[`${stage}/pixel/${pixel.id}/${channel}`] = pixel.rgba[index] ?? null
      }
    }
  }
  if (observation.id === 'lifecycle-starting') {
    const restoration = observation.restoration
    const snapshots = Array.isArray(restoration.snapshots) ? restoration.snapshots.map(object) : []
    const paused = object(restoration.restoredFrom)
    const final = object(restoration.finalSnapshot)
    Object.assign(values, {
      'natural/first': naturalStartingTimeline(observation.frames ?? [], 1, true),
      'natural/reinserted': naturalStartingTimeline(observation.frames ?? [], 2, false),
      'natural/control-opacity': Boolean(observation.frames?.length) && observation.frames!.every(frame => frame.control === 1),
      'native/transition-events': [1, 2].every(cycle => nativeTransition(observation.events, cycle)),
      'native/control-no-transition': !observation.events.some(event => event.target === 'control'),
      'native/paused-existing-transition': snapshots.length === 3 && paused.duration === 1200 && typeof paused.currentTime === 'number' && paused.currentTime > 0 && paused.currentTime < 1200 && ['start', 'middle', 'end'].every((stage, index) => {
        const snapshot = snapshots[index]!
        return snapshot.stage === stage && [snapshot.before, snapshot.after].every((entry) => {
          const state = object(entry)
          return state.native === true && state.target === 'probe' && state.property === 'opacity' && state.duration === 1200 && state.playbackRate === 1 && state.playState === (stage === 'end' ? 'finished' : 'paused') && (stage === 'end' || state.registered === true) && state.currentTime === (stage === 'start' ? 0 : stage === 'middle' ? 600 : 1200)
        })
      }),
      'restored': final.native === true && final.playState === 'finished' && final.probeOpacity === 1 && final.controlOpacity === 1 && restoration.finalOpacity === 1,
    })
    for (const stage of ['start', 'middle', 'end']) {
      const after = object(snapshots.find(snapshot => snapshot.stage === stage)?.after)
      values[`${stage}/probe-opacity`] = typeof after.probeOpacity === 'number' ? after.probeOpacity : null
      values[`${stage}/control-opacity`] = typeof after.controlOpacity === 'number' ? after.controlOpacity : null
    }
  }
  else {
    const rawSteps = observation.restoration.steps
    const steps = Array.isArray(rawSteps) ? rawSteps.map(object) : []
    for (const [stage, open, input] of [['initial', false, 'none'], ['click-open', true, 'click'], ['click-close', false, 'click'], ['keyboard-open', true, 'keyboard'], ['restored', false, 'keyboard']] as const) {
      const events = observation.events.filter(event => event.step === stage)
      const raw = steps.find(step => step.stage === stage)
      const current = object(raw?.values)
      for (const name of ['open', 'control-open', 'pseudo-background', 'pseudo-content-visibility', 'content-background', 'control-pseudo-background']) {
        const value = current[`${stage}/${name}`]
        values[`${stage}/${name}`] = typeof value === 'string' || typeof value === 'boolean' ? value : null
      }
      const nativeInput = input === 'none' ? 'none' : ['probe', 'control'].every(id => events.some(event => event.trusted && event.target === `${id}-summary` && event.type === (input === 'click' ? 'pointerdown' : 'keydown') && (input === 'click' || event.key === 'Enter')) && events.some(event => event.trusted && event.target === `${id}-summary` && event.type === 'click')) ? input : 'missing'
      values[`${stage}/native-input`] = nativeInput
      values[`${stage}/native-toggle`] = ['probe', 'control'].every(id => events.some(event => event.trusted && event.type === 'toggle' && event.target === id && event.oldState === (open ? 'closed' : 'open') && event.newState === (open ? 'open' : 'closed')))
      for (const id of ['probe', 'control']) {
        const height = object(raw?.[`${id}Rect`]).height
        values[`${stage}/${id}-height`] = typeof height === 'number' ? height : null
      }
    }
    const final = object(steps.find(step => step.stage === 'restored')?.values)
    values.restored = observation.restoration.restored === true && final['restored/open'] === false && final['restored/control-open'] === false
  }
  return values
}
