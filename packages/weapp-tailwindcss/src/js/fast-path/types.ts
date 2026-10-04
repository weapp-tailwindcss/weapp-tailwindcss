export interface LiteralSpan {
  kind: 'string' | 'template'
  start: number
  end: number
  value: string
  isConditionTest: boolean
  classContext: boolean
}

export interface SourceAnalysis {
  literals: LiteralSpan[]
  hasModuleDeclarations: boolean
  hasTaggedTemplate: boolean
}
