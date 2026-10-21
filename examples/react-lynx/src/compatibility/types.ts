import type { ExpectedDeclaration } from '@weapp-tailwindcss/test-catalog'
import type { NativeScreenMetrics } from './fixed-size-contract'
import type { ResponsiveFrame, ResponsivePhase } from './responsive-contract'
import type { ThemeOverrideEvidence } from './theme-overrides-contract'

export { featureFamilies } from '@weapp-tailwindcss/test-catalog'
export type { CompatibilityCase, EvidenceLevel, ExpectedDeclaration, FeatureFamily, ProbeType } from '@weapp-tailwindcss/test-catalog'
export type RuntimeStatus = 'supported' | 'unsupported' | 'not-tested'
export type Platform = 'ios' | 'android'
export type FailureStage = 'generation' | 'encoder' | 'runtime' | 'version-limit'

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
  /** 候选独立记录生成与编码结果，避免同组中一项失败掩盖其它项。 */
  candidates?: StaticCandidateEvidence[]
}

export interface StaticCandidateEvidence {
  className: string
  generated: boolean
  bundled: boolean
  failureStage?: Extract<FailureStage, 'generation' | 'encoder'>
  reason?: string
  mediaGuard?: StaticMediaGuardEvidence
}

export interface StaticMediaGuardEvidence {
  className: string
  limitationId: 'lynx4.0.1-media-hover-unknown-v1'
  sourceSha256: string
  condition: '(hover:hover)'
  generatedRules: { selector: string, mediaConditions: string[] }[]
  bundledRules: { selector: string, mediaConditions: string[] }[]
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

export interface NativeRect {
  width: number
  height: number
  left: number
  right: number
  top: number
  bottom: number
}

export interface NativeGeometryEvidence {
  probe: NativeRect
  control: NativeRect
  probeContainer: NativeRect
  controlContainer: NativeRect
  probeChild: NativeRect
  controlChild: NativeRect
}

export interface NativeCaseResult extends PlatformResult {
  id: string
  failureStage?: Extract<FailureStage, 'runtime' | 'version-limit'>
  checkpoints: RuntimeCheckpoint[]
  geometry?: NativeGeometryEvidence
  screenMetrics?: NativeScreenMetrics
  colorScheme?: Record<'light' | 'dark' | 'restored', NativeColorSchemeReceipt>
  responsive?: Record<ResponsivePhase, ResponsiveFrame>
  /** 混合交互必须逐候选取证；旧报告缺失此字段时仅可历史展示。 */
  candidates?: NativeCandidateResult[]
}

interface NativeCandidateBase extends PlatformResult {
  className: string
  checkpoints: RuntimeCheckpoint[]
}

export type NativeCandidateResult = (NativeCandidateBase & { mediaGate?: never }) | (NativeCandidateBase & {
  status: 'unsupported'
  mediaGate: {
    limitationId: 'lynx4.0.1-media-hover-unknown-v1'
    stage: 'runtime'
    gate: 'media'
    condition: '(hover:hover)'
    sourceSha256: string
    evidenceId: 'media-hover-v1'
    downstream: { hoverInput: 'not-tested', pseudoState: 'not-tested' }
  }
})

export type NativeMediaGateProbeId = 'base' | 'control' | 'unguarded' | 'min-width' | 'hover-hover' | 'hover-none'

export interface ResolvedAndroidSdk {
  version: 1
  source: 'lynx-gradle-resolved-sdk-v1'
  runId: string
  bundleSha256: string
  component: string
  artifactVersion: string
  aarSha256: string
  libraries: Record<string, string>
}

export interface NativeAndroidSdkArtifact {
  resolved: ResolvedAndroidSdk
  apkSha256: string
  abi: string
  librarySha256: string
}

export interface NativeMediaGateEvidence {
  limitationId: 'lynx4.0.1-media-hover-unknown-v1'
  runId: string
  bundleSha256: string
  /** 原生 SDK getter 的原始 reported 值，不能替换为 Maven release 版本。 */
  sdkVersion: string
  sdkArtifact?: NativeAndroidSdkArtifact
  probes: { id: NativeMediaGateProbeId, probe: NativeRect, container: NativeRect }[]
}

export interface NativeMediaGateCapture {
  mediaGate: NativeMediaGateEvidence
  artifacts: NativeArtifactReceipt[]
}

export interface NativeColorSchemeReceipt {
  runId: string
  requestId: string
  scheme: 'light' | 'dark'
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
  mediaGate?: NativeMediaGateEvidence
  themeOverrides?: ThemeOverrideEvidence
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
    tasmEncoder: string
    cssSerializer: string
    tasmDecoder: string
    bundleConfig: string
  }
  environments?: Record<Platform, NativeRuntimeEnvironment>
  results: CaseBaseline[]
}
