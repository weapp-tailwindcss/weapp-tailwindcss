import type { CaseContract, SemanticAssertion } from '../types'
import type { FrameworkSourceProfile, SourceBranchState, SourceRevision } from './fixtures'
import { cssDeclarations } from '../css'
import { frameworkSourceCss, sourceBranchStates, sourceCandidate, sourceExpectedWidth, sourceRevisions } from './fixtures'

export interface FrameworkSourceObservation {
  kind: string
  classes: string
  width: number
  padding: number
  active: string
  node: string
  session: string
  marker: string
  instance: string
}

export function sourceCssAssertions(profile: FrameworkSourceProfile, revision: SourceRevision, css: string) {
  const parsed = cssDeclarations(css)
  const padding = parsed.byClass.get('p-4')?.some(declaration => declaration.property === 'padding' && declaration.value?.trim()) === true
  const candidates = [true, false].map(active => sourceCandidate(profile, revision, active)).filter(Boolean)
  const generated = padding && (profile.kind === 'interpolation-negative' || candidates.every((candidate) => {
    const widths = parsed.byClass.get(candidate)?.filter(declaration => declaration.property === 'width') ?? []
    return widths.length > 0 && widths.every(declaration => declaration.value === candidate.match(/^w-\[(\d+px)\]$/)?.[1])
  }))
  return [
    { name: `${revision}/css-generated`, stage: 'generation' as const, actual: generated, expected: true },
    ...(profile.kind === 'interpolation-negative' ? [{ name: `${revision}/css-excluded`, stage: 'negative' as const, actual: candidates.every(candidate => !parsed.byClass.has(candidate)), expected: true }] : []),
  ]
}

export function sourceRuntimeAssertions(profile: FrameworkSourceProfile, revision: SourceRevision, state: SourceBranchState, actual: FrameworkSourceObservation, binding: { runId: string, instance: string, session: string, node: string }): SemanticAssertion[] {
  const prefix = `${revision}/${state}`
  const active = state !== 'after'
  const candidate = sourceCandidate(profile, revision, active)
  const tokens = ['source-probe', 'p-4', ...(candidate ? [candidate] : [])].sort()
  return [
    { name: `${prefix}/kind`, stage: 'runtime', actual: actual.kind === profile.kind, expected: true },
    { name: `${prefix}/width`, stage: 'runtime', actual: actual.width, expected: sourceExpectedWidth(profile, revision, active), tolerance: 0.25 },
    { name: `${prefix}/padding`, stage: 'runtime', actual: actual.padding, expected: 16, tolerance: 0.25 },
    { name: `${prefix}/classes`, stage: 'runtime', actual: JSON.stringify(actual.classes.trim().split(/\s+/).sort()) === JSON.stringify(tokens), expected: true },
    { name: `${prefix}/active`, stage: 'runtime', actual: actual.active === String(active), expected: true },
    { name: `${prefix}/marker`, stage: 'runtime', actual: actual.marker === `${binding.runId}/${profile.framework}/${revision}`, expected: true },
    { name: `${prefix}/instance`, stage: 'runtime', actual: actual.instance === binding.instance && Boolean(binding.instance), expected: true },
    { name: `${prefix}/session`, stage: 'runtime', actual: Boolean(binding.session) && actual.session === binding.session, expected: true },
    { name: `${prefix}/node`, stage: 'runtime', actual: Boolean(binding.node) && actual.node === binding.node, expected: true },
  ]
}

export function frameworkSourceContract(profile: FrameworkSourceProfile): CaseContract {
  const expectedValues: CaseContract['expectedValues'] = { 'no-page-errors': true }
  const tolerances: Record<string, number> = {}
  const assertionStages: CaseContract['assertionStages'] = {}
  for (const revision of sourceRevisions) {
    expectedValues[`${revision}/refresh-session`] = true
    expectedValues[`${revision}/css-generated`] = true
    assertionStages[`${revision}/css-generated`] = 'generation'
    if (profile.kind === 'interpolation-negative') {
      expectedValues[`${revision}/css-excluded`] = true
      assertionStages[`${revision}/css-excluded`] = 'negative'
    }
    for (const state of sourceBranchStates) {
      const prefix = `${revision}/${state}`
      for (const property of ['kind', 'classes', 'active', 'marker', 'instance', 'session', 'node']) {
        expectedValues[`${prefix}/${property}`] = true
      }
      expectedValues[`${prefix}/width`] = sourceExpectedWidth(profile, revision, state !== 'after')
      expectedValues[`${prefix}/padding`] = 16
      tolerances[`${prefix}/width`] = 0.25
      tolerances[`${prefix}/padding`] = 0.25
    }
  }
  return { id: profile.id, features: ['framework-execution', 'source-scanning', profile.framework, profile.kind], candidate: sourceRevisions.flatMap(revision => [true, false].map(active => sourceCandidate(profile, revision, active))).filter(Boolean).join(' '), fixture: JSON.stringify({ profile, css: frameworkSourceCss(profile.framework), revisions: sourceRevisions }), expectation: { support: 'supported', stage: 'runtime' }, requiredAssertions: Object.keys(expectedValues), expectedValues, tolerances, assertionStages }
}
