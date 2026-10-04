export type TransferMode = 'normal' | 'raw'
export type Comparison = 'transfer' | 'native'
export type BenchmarkMode = TransferMode | 'off' | 'required'
export type Phase = 'self-check' | 'build' | 'dev-startup' | 'text' | 'add' | 'remove' | 'restore'

export interface WorkerOptions {
  target: 'web' | 'weapp'
  root: string
  output: string
  compare: Comparison
  mode: BenchmarkMode
  pair: number
  selfCheck: boolean
  timeoutMs: number
}

export interface ParseCount {
  calls: number
  rawTransferCalls: number
  failures: number
  sourceCodeUnits: number
  filenames: string[]
}

export type NativeMethod = 'tokenizeWxml' | 'createWxmlTransformer' | 'transformStatic' | 'analyzeJs' | 'jsRuntimeSignature' | 'createJsTransformer' | 'replaceClassNames' | 'transform' | 'transformWithCandidates' | 'escapeClasses' | 'transformSelector' | 'transformSelectors' | 'transformSelectorRule' | 'normalizeV4Declaration' | 'normalizeV4GradientPosition' | 'normalizeV4InfinityCalc' | 'normalizeV4VariableFallbacks' | 'normalizeUvueTransformValue' | 'normalizeUvueTransformValues'

export interface NativeCount {
  calls: number
  failures: number
  nullReturns: number
  sourceCodeUnits: number
}

export interface NativeReport {
  bindings: Array<{ kernel: 'core' | 'postcss', resolved: string, sha256: string, loaded: boolean }>
  counts: Partial<Record<Phase, Partial<Record<NativeMethod, NativeCount>>>>
}

export interface PageState {
  markup: string
  heading: string
  headingSize: string
  headingLineHeight: string
  mainBackground: string
  buttonBackground: string
  textPresent: boolean
  probe: null | { text: string, width: string, height: string, background: string }
  session: string
}

export interface WorkerReport {
  status: 'running' | 'passed' | 'failed' | 'self-check'
  compare: Comparison
  mode: BenchmarkMode
  pair: number
  error?: string
  cleanupErrors: string[]
  serverErrors: string[]
  browserErrors: string[]
  diagnostics?: {
    expectedSession?: string
    failureState?: PageState
    phase: Phase
    events: Array<{ phase: Phase, milliseconds: number, type: string, detail: string }>
  }
  parser: { resolved: string, rawTransferSupported: boolean, counts: Partial<Record<Phase, ParseCount>> }
  native?: NativeReport
  build?: { milliseconds: number, sha256: string, artifacts: Array<{ name: string, bytes: number, sha256: string }> }
  startupMs?: number
  hmr: Array<{ phase: string, milliseconds: number, state: Omit<PageState, 'session'> }>
  peakNodeRssKiB: number
  memoryScope: string
  restored: boolean
}
