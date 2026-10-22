import { authoringFixtures, cssAuthoringCapabilities } from './authoring'
import { compatibilityCases } from './compatibility/catalog'
import { officialFeatureManifest } from './compatibility/manifest'
import { tailwindParityCandidateCategories, tailwindParityCandidates } from './parity-candidates'
import { miniProgramRuntimeColorWeightLimit } from './platform-limits'
import { sourceSyntaxCases } from './source-syntax'
import { arbitrarySyntaxCases, functionalValueProfiles } from './value-profiles'

export { authoringFixtures, cssAuthoringCapabilities } from './authoring'
export type { AuthoringFixture } from './authoring'
export { compatibilityCases, compatibilityPages } from './compatibility/catalog'
export type { CompatibilityPageId } from './compatibility/catalog'
export { officialFeatureManifest } from './compatibility/manifest'
export type { OfficialFeature } from './compatibility/manifest'
export * from './compatibility/types'
export { tailwindParityCandidateCategories, tailwindParityCandidates } from './parity-candidates'
export { miniProgramRuntimeColorWeightLimit } from './platform-limits'
export { sourceSyntaxCases } from './source-syntax'
export type { SourceSyntaxCase } from './source-syntax'
export { arbitrarySyntaxCases, functionalValueProfiles } from './value-profiles'
export type { FunctionalValueProfileId } from './value-profiles'

export const compatibilityCandidateMap = compatibilityCases.map(item => ({
  caseId: item.id,
  candidates: (item.className.match(/\S+/g) ?? []).map((candidate, index) => ({
    id: `${item.id}--candidate-${index + 1}`,
    candidate,
  })),
}))

export const catalogIdentity = {
  schemaVersion: 1,
  tailwindcss: '4.3.3',
  compatibilityCases,
  compatibilityCandidateMap,
  officialFeatureManifest,
  authoringFixtures,
  cssAuthoringCapabilities,
  sourceSyntaxCases,
  arbitrarySyntaxCases,
  functionalValueProfiles,
  tailwindParityCandidateCategories,
  tailwindParityCandidates,
  miniProgramRuntimeColorWeightLimit,
} as const

export const catalogIdentityPayload = JSON.stringify(catalogIdentity)
