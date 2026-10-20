export interface LynxEncoderDiagnostic {
  type: string
  name: string
  line?: number
  column?: number
}

interface SourceLocation { line: number, column: number }

/** serializer 的输入位置仅用于诊断归属，不代表编码输出语义。 */
export interface SerializedLynxRule {
  selectorText?: { value: string, loc?: SourceLocation }
  style?: Array<{ name: string, defaultValueMap?: Record<string, string>, keyLoc?: SourceLocation, valLoc?: SourceLocation }>
}
