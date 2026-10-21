import type { WeappPhase, WeappProbe } from './types'

export function weappStates(probe: WeappProbe): readonly WeappPhase[] {
  return probe.phases ?? [{
    name: 'default',
    candidates: probe.candidates,
    ...(probe.inline ? { inline: probe.inline } : {}),
    reference: probe.reference,
    expected: { [probe.property]: probe.expected, ...probe.styles },
    ...(probe.pixel ? { pixel: { actual: probe.pixel, reference: probe.pixel, equal: true } } : {}),
  }]
}

export function weappState(probe: WeappProbe, name: string): WeappPhase {
  const state = weappStates(probe).find(state => state.name === name)
  if (!state) {
    throw new Error(`微信夹具缺少预声明阶段：${probe.id}/${name}`)
  }
  return state
}
