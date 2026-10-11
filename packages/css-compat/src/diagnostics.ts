export type CascadeLayerDiagnosticCode
  = | 'LAYER_OPTIONS' | 'LAYER_INPUT_STAGE' | 'LAYER_IMPORT' | 'LAYER_REVERT'
    | 'LAYER_NESTING' | 'LAYER_NAME' | 'LAYER_PREPROCESSOR'
    | 'LAYER_CONDITIONAL_ORDER' | 'LAYER_SPECIFICITY' | 'LAYER_SELECTOR_UNKNOWN'
    | 'LAYER_DESCRIPTOR_ORDER' | 'LAYER_WRAPPER_SEMANTICS'

export interface CascadeLayerSource {
  file?: string | undefined
  line?: number | undefined
  column?: number | undefined
}

export interface CascadeLayerDiagnostic {
  code: CascadeLayerDiagnosticCode
  severity: 'warning' | 'error'
  message: string
  suggestion: string
  source: CascadeLayerSource
  related?: CascadeLayerSource | undefined
  layer?: string | undefined
  selector?: string | undefined
  property?: string | undefined
}

/** 编译失败的诊断集合；失败时调用者的 Root 保持完整。 */
export class CascadeLayerError extends Error {
  readonly diagnostics: readonly CascadeLayerDiagnostic[]

  constructor(diagnostics: readonly CascadeLayerDiagnostic[]) {
    super(diagnostics.map(item => `[${item.code}] ${item.message}`).join('\n'))
    this.name = 'CascadeLayerError'
    this.diagnostics = [...diagnostics]
  }
}
