import type { TailwindInventory } from '../inventory'
import type { BrowserEngine, CaseContract, SemanticAssertion } from '../types'
import type { RegistryObservation } from './measure'
import type { RegistryWebProfile } from './profiles'
import { registryLimitContract, registryWebLimit } from './limits'
import { registryGeometryEqual, registryReferenceEffective, registryStyleEqual } from './measure'

export function registryWebContracts(profiles: readonly RegistryWebProfile[], engine?: BrowserEngine, platform = ''): CaseContract[] {
  return profiles.map((profile) => {
    const limit = engine ? registryWebLimit(profile, engine, platform) : undefined
    return limit
      ? registryLimitContract(profile, limit)
      : ({
          id: profile.id,
          features: [profile.featureId],
          candidate: profile.candidate,
          fixture: JSON.stringify({ ...profile, geometryTolerance: 0.25, animationTimeMs: 137, oracle: 'independent-official-tailwindcss-reference-with-baseline' }),
          expectation: { support: 'supported', stage: 'runtime' },
          requiredAssertions: ['generated', 'reference-measurable', 'reference-effective', 'styles-match-reference', 'geometry-match-reference'],
          expectedValues: { 'generated': true, 'reference-measurable': true, 'reference-effective': true, 'styles-match-reference': true, 'geometry-match-reference': true },
          assertionStages: { generated: 'generation' },
        })
  })
}

export function registryWebCoverage(inventory: TailwindInventory) {
  return [
    ...inventory.utilities.map(item => ({ featureId: item.id, caseIds: [`registry/${item.id}`], status: 'fixture-defined' as const })),
    ...inventory.variants.map(item => ({ featureId: item.id, caseIds: [], status: 'not-run' as const, reason: '注册 utility 对照不执行 variant 状态；必须使用独立状态夹具，不能由生成或基础样式对照替代。' })),
  ]
}

export function registryAssertions(profile: RegistryWebProfile, generated: boolean, reference: RegistryObservation, baseline: RegistryObservation, actual: RegistryObservation): SemanticAssertion[] {
  const measurable = reference.geometry.length >= 6 && reference.geometry.every(Number.isFinite)
    && profile.properties.some(property => !property.startsWith('--') && (reference.styles[property] || reference.childStyles.some(child => child[property])))
    && profile.requiredEffects.every(property => !!reference.styles[property] && reference.styles[property] !== 'none')
  return [
    { name: 'generated', stage: 'generation', actual: generated, expected: true },
    { name: 'reference-measurable', stage: 'runtime', actual: measurable, expected: true },
    { name: 'reference-effective', stage: 'runtime', actual: registryReferenceEffective(reference, baseline), expected: true },
    { name: 'styles-match-reference', stage: 'runtime', actual: registryStyleEqual(actual, reference), expected: true },
    { name: 'geometry-match-reference', stage: 'runtime', actual: registryGeometryEqual(actual, reference), expected: true },
  ]
}
