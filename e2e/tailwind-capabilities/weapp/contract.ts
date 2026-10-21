import type { CaseContract, SemanticAssertion } from '../types'
import type { WeappProbe } from './fixtures'
import { nominalCompositeSamples, weappCompositeAssertions } from './compositing'
import { weappFeatureBindings } from './coverage'
import { weappState, weappStates } from './phases'
import { weappPhasePixelAssertions } from './pixels'

export const weappPhases = (probe: WeappProbe) => weappStates(probe).map(state => state.name)

export function weappExpectedStyles(probe: WeappProbe, phase: string): Record<string, string> {
  return { ...weappState(probe, phase).expected }
}

export function weappRuntimeAssertions(probe: WeappProbe, phase: string, actual: Readonly<Record<string, string | undefined>>, reference: Readonly<Record<string, string | undefined>>, witness: Readonly<Record<string, string | undefined>> = {}): SemanticAssertion[] {
  const state = weappState(probe, phase)
  const referenceExpected = state.referenceExpected ?? state.expected
  const checks: SemanticAssertion[] = [
    ...Object.entries(state.expected).map(([property, expected]) => ({ name: `${phase}/style/${property}`, stage: 'runtime' as const, actual: actual[property] ?? null, expected })),
    ...Object.entries(referenceExpected).map(([property, expected]) => ({ name: `${phase}/reference/${property}`, stage: 'runtime' as const, actual: reference[property] ?? null, expected })),
    ...Object.entries(state.witness?.expected ?? {}).map(([property, expected]) => ({ name: `${phase}/witness/${property}`, stage: 'runtime' as const, actual: witness[property] ?? null, expected })),
  ]
  if (probe.limit) {
    checks.push({ name: `${phase}/semantic-difference`, stage: 'negative', actual: Object.keys(state.expected).some(property => actual[property] !== reference[property]), expected: true })
  }
  return checks
}

/** 预期先于运行，动态正向与限制负向分别保留每个阶段的独立语义。 */
export function weappContract(probe: WeappProbe): CaseContract {
  const checks = weappStates(probe).flatMap(state => [
    ...weappRuntimeAssertions(probe, state.name, state.expected, state.referenceExpected ?? state.expected, state.witness?.expected),
    ...(state.pixel ? weappPhasePixelAssertions(state.name, state.pixel.actual, state.pixel.reference, state.pixel) : []),
    ...(state.composite ? weappCompositeAssertions(state.name, nominalCompositeSamples(state.composite), state.composite) : []),
  ])
  return {
    id: probe.id,
    features: weappFeatureBindings[probe.id] ?? [`authoring/${probe.id}`],
    candidate: probe.candidates.join(' '),
    fixture: JSON.stringify(probe),
    expectation: probe.limit ? { support: 'unsupported', stage: 'negative', reason: probe.limit.reason } : { support: 'supported', stage: 'runtime' },
    requiredAssertions: checks.map(item => item.name),
    expectedValues: Object.fromEntries(checks.map(item => [item.name, item.expected as string | number | boolean])),
    assertionStages: Object.fromEntries(checks.map(item => [item.name, item.stage])),
    tolerances: Object.fromEntries(checks.filter(item => item.tolerance !== undefined).map(item => [item.name, item.tolerance!])),
  }
}
