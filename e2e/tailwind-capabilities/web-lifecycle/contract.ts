import type { CaseContract, SemanticAssertion } from '../types'
import type { LifecycleProbe } from './fixtures'
import type { LifecycleObservation, LifecycleValues } from './types'
import { lifecycleRawValues } from './evidence'
import { lifecycleFixtureUrl, lifecycleWebFixtureCss, renderLifecycleProbe } from './fixtures'
import { startingOpacityTolerance } from './starting-timeline'

const channels = ['red', 'green', 'blue', 'alpha'] as const
const active = [18, 52, 86, 255] as const
const white = [255, 255, 255, 255] as const

function pixelValues(stage: string, id: string, rgba: readonly number[]): LifecycleValues {
  return Object.fromEntries(channels.map((channel, index) => [`${stage}/pixel/${id}/${channel}`, rgba[index]!]))
}

export function lifecycleWebContract(probe: LifecycleProbe, runId: string): CaseContract {
  const expected: LifecycleValues = { 'generated': true, 'fixture/id': probe.id, 'fixture/run-id': runId, 'fixture/url': lifecycleFixtureUrl(runId, probe.id), 'events/untrusted': false, 'restored': true }
  const tolerances: Record<string, number> = {}
  if (probe.id === 'lifecycle-starting') {
    Object.assign(expected, { 'natural/first': true, 'natural/reinserted': true, 'native/transition-events': true, 'native/control-no-transition': true, 'native/paused-existing-transition': true, 'natural/control-opacity': true })
    for (const [stage, opacity, color] of [['start', 0, white], ['middle', 0.5, [137, 154, 171, 255]], ['end', 1, active]] as const) {
      Object.assign(expected, { [`${stage}/probe-opacity`]: opacity, [`${stage}/control-opacity`]: 1 }, pixelValues(stage, 'probe', color), pixelValues(stage, 'control', active))
      tolerances[`${stage}/probe-opacity`] = startingOpacityTolerance
      tolerances[`${stage}/control-opacity`] = 0.001
    }
  }
  else {
    expected['supports/details-content'] = true
    for (const [stage, open, input] of [['initial', false, 'none'], ['click-open', true, 'click'], ['click-close', false, 'click'], ['keyboard-open', true, 'keyboard'], ['restored', false, 'keyboard']] as const) {
      Object.assign(expected, {
        [`${stage}/open`]: open,
        [`${stage}/control-open`]: open,
        [`${stage}/pseudo-background`]: 'rgb(18, 52, 86)',
        [`${stage}/pseudo-content-visibility`]: open ? 'visible' : 'hidden',
        [`${stage}/content-background`]: 'rgba(0, 0, 0, 0)',
        [`${stage}/control-pseudo-background`]: 'rgba(0, 0, 0, 0)',
        [`${stage}/native-input`]: input,
        [`${stage}/native-toggle`]: stage !== 'initial',
        [`${stage}/probe-height`]: open ? 96 : 32,
        [`${stage}/control-height`]: open ? 96 : 32,
      }, pixelValues(stage, 'probe-content', open ? active : white), pixelValues(stage, 'control-content', white), pixelValues(stage, 'probe-summary', white), pixelValues(stage, 'control-summary', white))
      tolerances[`${stage}/probe-height`] = 0.1
      tolerances[`${stage}/control-height`] = 0.1
    }
  }
  const expectedValues = expected as CaseContract['expectedValues']
  const assertionStages: CaseContract['assertionStages'] = { generated: 'generation' }
  for (const key of Object.keys(expectedValues)) {
    if (key.includes('/pixel/')) {
      assertionStages[key] = 'visual'
      tolerances[key] = 2
    }
  }
  return { id: `runtime/${probe.id}`, candidate: probe.candidate, features: [...probe.features], fixture: JSON.stringify({ probe, css: lifecycleWebFixtureCss, html: renderLifecycleProbe(probe, 'GENERATED_CSS', 'RUN_ID') }), expectation: { support: 'supported', stage: 'runtime' }, requiredAssertions: Object.keys(expectedValues), expectedValues, tolerances, assertionStages }
}

export function lifecycleAssertions(contract: CaseContract, observation: LifecycleObservation, generated: boolean): SemanticAssertion[] {
  const values: LifecycleValues = { ...observation.values, ...lifecycleRawValues(observation), 'generated': generated, 'fixture/id': observation.id, 'fixture/run-id': observation.runId, 'fixture/url': observation.url, 'events/untrusted': observation.events.some(event => !event.trusted) }
  return contract.requiredAssertions.map(name => ({ name, stage: contract.assertionStages?.[name] ?? 'runtime', actual: values[name] ?? null, expected: contract.expectedValues[name]!, ...(contract.tolerances?.[name] === undefined ? {} : { tolerance: contract.tolerances[name] }) }))
}

export { naturalStartingTimeline } from './starting-timeline'
