export type Mode = 'normal' | 'raw'
export type Phase = 'cold-analysis' | 'warm-analysis' | 'cold-handler' | 'warm-handler'

export interface Request {
  phase: Phase
  source: string
  iterations: number
}

export interface Analysis {
  literals: Array<{ kind: string, start: number, end: number, value: string, isConditionTest: boolean }>
  hasModuleDeclarations: boolean
  hasTaggedTemplate: boolean
}

export interface Measurement {
  type: 'measurement'
  mode: Mode
  elapsedMs: number
  perOperationMs: number
  iterations: number
  timedParserCalls: number
  totalParserCalls: number
  analysis: Analysis
  code: string
}

export interface Ready {
  type: 'ready'
  mode: Mode
  node: string
  v8: string
  versions: Record<string, string>
  parserEntry: string
}

export type WorkerReply = Ready | Measurement | { type: 'error', message: string, stack?: string }
