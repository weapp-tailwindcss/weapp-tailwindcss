import type { CaseContract, SemanticAssertion } from '../types'
import type { WebObservation } from './actions'
import type { WebProbe } from './probes'
import { pixelAssertionName, rgbaChannels } from './pixels'

function layoutValues(probe: WebProbe) {
  if (!probe.layout) {
    return []
  }
  return [
    { key: 'display', expected: probe.layout.display },
    { key: 'width', expected: probe.layout.width, tolerance: 0.25 },
    { key: 'height', expected: probe.layout.height, tolerance: 0.25 },
    { key: 'child-count', expected: probe.layout.children.length },
    ...probe.layout.children.flatMap((child, index) => (['left', 'top', 'width', 'height'] as const).map(property => ({ key: `child-${index}/${property}`, expected: child[property], tolerance: 0.25 }))),
  ]
}

export function webContract(probe: WebProbe): CaseContract {
  const checkpoints = probe.checkpoints ?? []
  if (new Set(checkpoints.map(item => item.name)).size !== checkpoints.length || checkpoints.some(item => ['before', 'after', 'restored', 'computed', 'generated'].includes(item.name) || !Number.isInteger(item.afterControl) || item.afterControl < 1 || item.afterControl >= (probe.controls?.length ?? 0))) {
    throw new Error(`${probe.id} 中间负控制必须位于两个真实动作之间，并使用独立名称`)
  }
  const states = probe.action ? ['before', ...checkpoints.map(item => item.name), 'after', 'restored'] : ['computed']
  const expectedValues = Object.fromEntries(states.map(state => [state, checkpoints.find(item => item.name === state)?.expected ?? (state === 'before' || state === 'restored' ? probe.before! : probe.expected)]))
  const pixels = (probe.pixels ?? []).flatMap(sample => rgbaChannels.map((channel, index) => ({ name: pixelAssertionName(sample, channel), expected: sample.expected[index]!, tolerance: sample.tolerance })))
  const layout = states.flatMap(state => layoutValues(probe).map(item => ({ ...item, name: `${state}/layout/${item.key}` })))
  return {
    id: `runtime/${probe.id}`,
    features: probe.features,
    candidate: probe.candidate,
    fixture: probe.html,
    expectation: { support: 'supported', stage: 'runtime' },
    requiredAssertions: ['generated', ...states, ...layout.map(item => item.name), ...pixels.map(item => item.name)],
    expectedValues: { generated: true, ...expectedValues, ...Object.fromEntries([...layout, ...pixels].map(item => [item.name, item.expected])) },
    ...(pixels.length || layout.length ? { tolerances: Object.fromEntries([...layout, ...pixels].filter(item => item.tolerance !== undefined).map(item => [item.name, item.tolerance!])) } : {}),
    assertionStages: { generated: 'generation', ...Object.fromEntries(pixels.map(item => [item.name, 'visual' as const])) },
  }
}

export function webRuntimeAssertions(probe: WebProbe, state: string, observation: Pick<WebObservation, 'actual' | 'layout'>): SemanticAssertion[] {
  const values: Record<string, string | number> = observation.layout
    ? {
        'display': observation.layout.display,
        'width': observation.layout.width,
        'height': observation.layout.height,
        'child-count': observation.layout.children.length,
        ...Object.fromEntries(observation.layout.children.flatMap((child, index) => Object.entries(child).map(([property, value]) => [`child-${index}/${property}`, value]))),
      }
    : {}
  return [
    { name: state, stage: 'runtime', actual: observation.actual, expected: probe.checkpoints?.find(item => item.name === state)?.expected ?? (state === 'before' || state === 'restored' ? probe.before! : probe.expected) },
    ...layoutValues(probe).map(item => ({ name: `${state}/layout/${item.key}`, stage: 'runtime' as const, actual: values[item.key] ?? null, expected: item.expected, ...(item.tolerance !== undefined ? { tolerance: item.tolerance } : {}) })),
  ]
}

export function renderWebProbe(probe: WebProbe) {
  if (probe.action && probe.before === undefined) {
    throw new Error(`${probe.id} 缺少独立定义的状态前置和恢复预期`)
  }
  return probe.html.replaceAll('CANDIDATE', probe.candidate.replaceAll('&', '&amp;').replaceAll('"', '&quot;'))
}
