import type { CaseContract, SemanticAssertion } from '../types'
import type { AuthoringWebProfile } from './profiles'
import { assertionPassed } from '../report'

export interface AuthoringWebMeasurement {
  group: number
  properties: string[]
  product: string[]
  reference: string[]
  baseline: string[]
  referenceSupported: boolean[]
  excluded?: boolean
}

export function authoringStates(profile: AuthoringWebProfile) {
  return profile.action || profile.groups.some(group => group.interaction) ? ['before', 'after', 'restored'] : ['computed']
}

function measurementNames(profile: AuthoringWebProfile, state: string) {
  return profile.groups.flatMap((group, index) => group.declarations.flatMap(declaration => [
    `${state}/reference-observable/${index}/${declaration.property}`,
    `${state}/computed/${index}/${declaration.property}`,
    ...(state === 'computed' || state === 'after' ? [`${state}/reference-effective/${index}/${declaration.property}`] : []),
  ]))
}

export function authoringWebContract(profile: AuthoringWebProfile): CaseContract {
  const requiredAssertions = profile.reason ? ['runtime-oracle'] : ['generated', 'excluded', 'no-page-errors', ...authoringStates(profile).flatMap(state => measurementNames(profile, state))]
  return {
    id: profile.id,
    candidate: profile.groups.map(group => group.className).join(' '),
    features: [profile.fixture.id.startsWith('scan-') ? 'source-scanning' : 'authoring', profile.fixture.id],
    fixture: JSON.stringify(profile),
    expectation: { support: 'supported', stage: 'runtime' },
    requiredAssertions,
    expectedValues: Object.fromEntries(requiredAssertions.map(name => [name, true])),
    assertionStages: { generated: 'generation', excluded: 'generation' },
  }
}

export function authoringMeasurementAssertions(state: string, measurement: AuthoringWebMeasurement): SemanticAssertion[] {
  return measurement.properties.flatMap((property, index) => {
    const suffix = `${measurement.group}/${property}`
    const reference = measurement.reference[index]
    const actual = measurement.product[index]
    return [
      { name: `${state}/reference-observable/${suffix}`, stage: 'runtime' as const, actual: measurement.referenceSupported[index] === true && typeof reference === 'string' && reference.trim() !== '', expected: true },
      { name: `${state}/computed/${suffix}`, stage: 'runtime' as const, actual: typeof actual === 'string' && actual.trim() !== '' && actual === (measurement.excluded ? measurement.baseline[index] : reference), expected: true },
      ...(state === 'computed' || state === 'after' ? [{ name: `${state}/reference-effective/${suffix}`, stage: 'runtime' as const, actual: typeof reference === 'string' && reference.trim() !== '' && reference !== measurement.baseline[index], expected: true }] : []),
    ]
  })
}

export function authoringWebOutcome(assertions: SemanticAssertion[]) {
  if (!assertions.length) {
    return 'not-run'
  }
  const failed = assertions.filter(assertion => !assertionPassed(assertion))
  if (!failed.length) {
    return 'passed'
  }
  if (failed.some(assertion => ['generated', 'excluded', 'no-page-errors'].includes(assertion.name))) {
    return 'failed'
  }
  return failed.some(assertion => assertion.name.includes('/reference-')) ? 'not-run' : 'failed'
}
