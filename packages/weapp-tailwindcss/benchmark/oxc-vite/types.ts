export type TransferMode = 'normal' | 'raw'
export type Phase = 'self-check' | 'build' | 'dev-startup' | 'text' | 'add' | 'remove' | 'restore'

export interface WorkerOptions {
  root: string
  output: string
  mode: TransferMode
  pair: number
  selfCheck: boolean
  timeoutMs: number
}

export interface ParseCount {
  calls: number
  failures: number
  sourceCodeUnits: number
  filenames: string[]
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
  mode: TransferMode
  pair: number
  error?: string
  cleanupErrors: string[]
  serverErrors: string[]
  browserErrors: string[]
  parser: { resolved: string, rawTransferSupported: boolean, counts: Partial<Record<Phase, ParseCount>> }
  build?: { milliseconds: number, sha256: string, artifacts: Array<{ name: string, bytes: number, sha256: string }> }
  startupMs?: number
  hmr: Array<{ phase: string, milliseconds: number, state: Omit<PageState, 'session'> }>
  peakNodeRssKiB: number
  memoryScope: string
  restored: boolean
}
