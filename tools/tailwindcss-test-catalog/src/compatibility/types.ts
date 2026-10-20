export const featureFamilies = [
  'layout',
  'flex-grid',
  'spacing',
  'sizing',
  'typography',
  'background',
  'border',
  'effect',
  'filter',
  'table',
  'transform',
  'transition-animation',
  'interactivity',
  'svg',
  'accessibility',
  'variants',
  'directives',
] as const

export type FeatureFamily = typeof featureFamilies[number]
export type EvidenceLevel = 'build' | 'runtime'
export type ProbeType = 'css' | 'geometry' | 'interaction' | 'pixel' | 'directive'
export type RuntimeStatus = 'supported' | 'unsupported' | 'not-tested'
export type Platform = 'ios' | 'android'
export type FailureStage = 'generation' | 'encoder' | 'runtime' | 'version-limit'

export interface ExpectedDeclaration {
  property: string
  value?: string
  important?: boolean
}

export interface CompatibilityCase {
  id: string
  family: FeatureFamily
  page: 'layout' | 'visual' | 'motion' | 'variants' | 'syntax'
  title: string
  className: string
  evidence: EvidenceLevel
  probe: ProbeType
  declarations: ExpectedDeclaration[]
  alternative?: string
  note?: string
}
