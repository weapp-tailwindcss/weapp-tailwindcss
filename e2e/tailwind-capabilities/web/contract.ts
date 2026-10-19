import type { CaseContract } from '../types'
import type { WebProbe } from './probes'
import { pixelAssertionName, rgbaChannels } from './pixels'

export function webContract(probe: WebProbe): CaseContract {
  const states = probe.action ? ['before', 'after', 'restored'] : ['computed']
  const expectedValues = Object.fromEntries(states.map(state => [state, state === 'before' || state === 'restored' ? probe.before! : probe.expected]))
  const pixels = (probe.pixels ?? []).flatMap(sample => rgbaChannels.map((channel, index) => ({ name: pixelAssertionName(sample, channel), expected: sample.expected[index]!, tolerance: sample.tolerance })))
  return {
    id: `runtime/${probe.id}`,
    features: probe.features,
    candidate: probe.candidate,
    fixture: probe.html,
    expectation: { support: 'supported', stage: 'runtime' },
    requiredAssertions: ['generated', ...states, ...pixels.map(item => item.name)],
    expectedValues: { generated: true, ...expectedValues, ...Object.fromEntries(pixels.map(item => [item.name, item.expected])) },
    ...(pixels.length ? { tolerances: Object.fromEntries(pixels.map(item => [item.name, item.tolerance])) } : {}),
    assertionStages: { generated: 'generation', ...Object.fromEntries(pixels.map(item => [item.name, 'visual' as const])) },
  }
}

export function renderWebProbe(probe: WebProbe) {
  if (probe.action && probe.before === undefined) {
    throw new Error(`${probe.id} 缺少独立定义的状态前置和恢复预期`)
  }
  return probe.html.replaceAll('CANDIDATE', probe.candidate.replaceAll('&', '&amp;').replaceAll('"', '&quot;'))
}
