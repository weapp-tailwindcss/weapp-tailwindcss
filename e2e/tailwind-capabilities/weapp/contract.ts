import type { CaseContract, SemanticAssertion } from '../types'
import type { WeappProbe } from './fixtures'
import { weappFeatureBindings } from './coverage'
import { weappPixelContract } from './pixels'

export const weappPhases = (probe: WeappProbe) => 'dynamic' in probe ? ['before', 'after', 'restored'] : ['default']

export function weappExpectedStyles(probe: WeappProbe, phase: string): Record<string, string> {
  return { [probe.property]: 'dynamic' in probe && phase === 'after' ? '64px' : probe.expected, ...('styles' in probe ? probe.styles : {}) }
}

export function weappRuntimeAssertions(probe: WeappProbe, phase: string, actual: Record<string, string | undefined>, reference: Record<string, string | undefined>): SemanticAssertion[] {
  return Object.entries(weappExpectedStyles(probe, phase)).flatMap(([property, expected]) => [
    { name: `${phase}/style/${property}`, stage: 'runtime', actual: actual[property] ?? null, expected },
    { name: `${phase}/reference/${property}`, stage: 'runtime', actual: reference[property] ?? null, expected },
  ])
}

/** 动态阶段和多属性必须同时验证目标与独立参考，缺测不能沿用主属性结论。 */
export function weappContract(probe: WeappProbe): CaseContract {
  const values = weappPhases(probe).flatMap(phase => Object.entries(weappExpectedStyles(probe, phase)).flatMap(([property, expected]) => [
    { name: `${phase}/style/${property}`, expected },
    { name: `${phase}/reference/${property}`, expected },
  ]))
  const pixel = 'pixel' in probe ? weappPixelContract(probe.pixel) : undefined
  return {
    id: probe.id,
    features: weappFeatureBindings[probe.id]!,
    candidate: probe.candidates.join(' '),
    fixture: JSON.stringify(probe),
    expectation: { support: 'supported', stage: 'runtime' },
    requiredAssertions: [...values.map(item => item.name), ...pixel?.requiredAssertions ?? []],
    expectedValues: { ...Object.fromEntries(values.map(item => [item.name, item.expected])), ...pixel?.expectedValues },
    ...(pixel ? { assertionStages: pixel.assertionStages, tolerances: pixel.tolerances } : {}),
  }
}
