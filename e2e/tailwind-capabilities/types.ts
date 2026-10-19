export const browserEngines = ['chromium', 'firefox', 'webkit'] as const
export type BrowserEngine = typeof browserEngines[number]
export type TailwindTarget = `web-${BrowserEngine}` | `expo-${BrowserEngine}` | 'weapp' | 'react-native-android' | 'react-native-ios' | 'lynx-android' | 'lynx-ios' | 'static'
export type EvidenceStage = 'generation' | 'encoding' | 'runtime' | 'visual' | 'negative'
export type Outcome = 'passed' | 'failed' | 'blocked' | 'not-run'

export interface CapabilityExpectation {
  support: 'supported' | 'unsupported'
  stage: EvidenceStage
  reason?: string
}

export interface SemanticAssertion {
  name: string
  stage: EvidenceStage
  actual: string | number | boolean | null
  expected: string | number | boolean | null
  tolerance?: number
}

export interface CaseContract {
  id: string
  features: string[]
  candidate: string
  fixture: string
  expectation: CapabilityExpectation
  requiredAssertions: string[]
  expectedValues: Record<string, string | number | boolean>
  tolerances?: Record<string, number>
  assertionStages?: Record<string, EvidenceStage>
}

export interface CapabilityResult {
  id: string
  status: Outcome
  support: CapabilityExpectation['support']
  assertions: SemanticAssertion[]
  reason?: string
  warnings: string[]
  artifacts: string[]
}

export interface CapabilityIdentity {
  sourceHash: string
  lockfileHash: string
  catalogHash: string
  fixtureHash: string
  expectationsHash: string
  versions: Record<string, string>
}

export interface ArtifactReceipt {
  path: string
  sha256: string
  byteLength: number
  kind: 'css' | 'bundle' | 'measurements' | 'screenshot' | 'log'
  runId: string
  caseIds: string[]
}

export interface CapabilityReport {
  schemaVersion: 2
  runId: string
  target: TailwindTarget
  observedAt: string
  identity: CapabilityIdentity
  environment: Record<string, string | number | boolean>
  results: CapabilityResult[]
  artifacts: ArtifactReceipt[]
}

export interface RuntimeProbe {
  id: string
  candidate: string
  html: string
  component: 'view' | 'text' | 'input' | 'children'
  property: string
  expected: string
  before?: string
  action?: 'hover' | 'focus' | 'checked' | 'dark' | 'responsive' | 'container' | 'dynamic'
  weapp?: { support: 'supported' | 'unsupported', reason?: string }
}
