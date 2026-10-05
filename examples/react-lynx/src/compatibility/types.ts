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

export interface PlatformResult {
  status: RuntimeStatus
  reason?: string
}

export interface CaseBaseline {
  id: string
  generated: boolean
  bundled: boolean
  failureStage?: FailureStage
  ios: PlatformResult
  android: PlatformResult
}

export interface StaticCaseEvidence {
  id: string
  generated: boolean
  bundled: boolean
  failureStage?: Extract<FailureStage, 'generation' | 'encoder'>
  reason?: string
  generatedDeclarations: ExpectedDeclaration[]
  bundledDeclarations: ExpectedDeclaration[]
  cssDefinesKnown: string[]
}

export interface StaticEvidenceReport {
  schemaVersion: 1
  catalogHash: string
  generatedAt: string
  versions: CompatibilityBaseline['versions']
  results: StaticCaseEvidence[]
}

export interface RuntimeCheckpoint {
  name: string
  passed: boolean
  actual?: string | number | boolean
  expected?: string | number | boolean
}

export interface NativeCaseResult extends PlatformResult {
  id: string
  failureStage?: Extract<FailureStage, 'runtime' | 'version-limit'>
  checkpoints: RuntimeCheckpoint[]
}

export interface NativeRuntimeEnvironment {
  deviceName: string
  deviceModel: string
  osName: 'iOS' | 'Android'
  osVersion: string
  osBuild: string
  runtimeIdentifier: string
  apiLevel?: number
  abi: string
  viewport: {
    width: number
    height: number
    pixelRatio: number
  }
}

export interface NativePlatformReport {
  schemaVersion: 1
  platform: Platform
  catalogHash: string
  verifiedAt: string
  versions: CompatibilityBaseline['versions']
  environment: NativeRuntimeEnvironment
  results: NativeCaseResult[]
  // 历史结论仍可展示；实时验收及基线更新必须携带完整的新证据协议。
  evidence?: NativeEvidenceContext & { artifacts: NativeArtifactReceipt[] }
}

export interface NativeEvidenceContext {
  version: 1
  runId: string
  bundleSha256: string
}

export interface NativeArtifactReceipt {
  runId: string
  name: string
  sha256: string
  byteLength: number
}

export interface CompatibilityBaseline {
  schemaVersion: 1
  catalogHash: string
  verifiedAt: string | null
  versions: {
    tailwindcss: string
    lynxEngine: string
    engineVersion: string
    cssDefines: string
  }
  environments?: Record<Platform, NativeRuntimeEnvironment>
  results: CaseBaseline[]
}
