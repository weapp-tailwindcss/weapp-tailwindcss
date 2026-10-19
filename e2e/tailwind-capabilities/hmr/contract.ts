import type { CaseContract, SemanticAssertion } from '../types'
import { hmrCss, hmrStates } from './fixture'

export interface HmrObservation {
  marker: string
  width: number
  session: string
  sourceUpdate: boolean
  fullReload: boolean
  instance: string
}

export function hmrContract(): CaseContract {
  const expectedValues: CaseContract['expectedValues'] = { 'refresh/width': 80, 'refresh/marker': true, 'refresh/session-replaced': true, 'refresh/instance': true }
  const tolerances: Record<string, number> = { 'refresh/width': 0.25 }
  for (const state of hmrStates) {
    expectedValues[`${state.id}/width`] = state.width
    expectedValues[`${state.id}/marker`] = true
    expectedValues[`${state.id}/instance`] = true
    expectedValues[`${state.id}/session-preserved`] = true
    tolerances[`${state.id}/width`] = 0.25
    if (state.id !== 'initial') {
      expectedValues[`${state.id}/source-update`] = true
      expectedValues[`${state.id}/full-reload`] = false
    }
  }
  return { id: 'hmr/source-add-replace-delete-refresh', features: ['source-scanning', 'hmr', 'dynamic-class', 'arbitrary-value'], candidate: 'w-[123px] w-[147px]', fixture: JSON.stringify({ hmrCss, hmrStates }), expectation: { support: 'supported', stage: 'hmr' }, requiredAssertions: Object.keys(expectedValues), expectedValues, tolerances }
}

export function hmrAssertions(state: typeof hmrStates[number], actual: HmrObservation, runId: string, session: string, instance: string): SemanticAssertion[] {
  return [
    { name: `${state.id}/width`, stage: 'hmr', actual: actual.width, expected: state.width, tolerance: 0.25 },
    { name: `${state.id}/marker`, stage: 'hmr', actual: actual.marker === `${runId}/${state.id}`, expected: true },
    { name: `${state.id}/instance`, stage: 'hmr', actual: actual.instance === instance, expected: true },
    { name: `${state.id}/session-preserved`, stage: 'hmr', actual: Boolean(session) && actual.session === session, expected: true },
    ...(state.id === 'initial'
      ? []
      : [
          { name: `${state.id}/source-update`, stage: 'hmr' as const, actual: actual.sourceUpdate, expected: true },
          { name: `${state.id}/full-reload`, stage: 'hmr' as const, actual: actual.fullReload, expected: false },
        ]),
  ]
}
