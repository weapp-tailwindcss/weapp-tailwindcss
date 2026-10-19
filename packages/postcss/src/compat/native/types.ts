export type NativePlatform = 'android' | 'ios' | 'native' | 'web'

export interface NativeVariableDefinition {
  value: string
  /** 声明所属 CSS 入口的根变量快照，仅保留该表达式依赖的默认值。 */
  defaults: Record<string, string>
}

export interface NativeStyleRule {
  style: Record<string, unknown>
  /** 变量自身参与独立的普通/important 级联，不能在每个 utility 中提前固定。 */
  customProperties?: Record<string, NativeVariableDefinition> | undefined
  /** 阴影依赖本次选中的全部变量规则，在运行时级联完成后展开。 */
  boxShadowExpression?: NativeVariableDefinition | undefined
  /** 相对行高在运行时按最终字号计算，不能把 CSS 倍率直接作为 RN 像素值。 */
  lineHeightMultiplier?: number | undefined
  colorScheme?: 'dark' | undefined
  platform?: NativePlatform | undefined
  important?: boolean | undefined
  order?: number | undefined
  id?: string | undefined
}

export interface NativeCompilerWarning {
  className?: string | undefined
  property?: string | undefined
  message: string
}

export interface CompileNativeStylesheetOptions {
  classSet?: Iterable<string> | undefined
  ignorePreflight?: boolean | undefined
  /** 宿主需支持现代 boxShadow；旧架构或不支持的平台必须显式禁用。 */
  boxShadow?: boolean | undefined
}

export interface NativeCssStylesheet {
  rules: Record<string, NativeStyleRule[]>
  variables: Record<string, string>
  warnings: NativeCompilerWarning[]
}
