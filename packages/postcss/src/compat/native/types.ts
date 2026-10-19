export type NativePlatform = 'android' | 'ios' | 'native' | 'web'

export interface NativeStyleRule {
  style: Record<string, unknown>
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
}

export interface NativeCssStylesheet {
  rules: Record<string, NativeStyleRule[]>
  variables: Record<string, string>
  warnings: NativeCompilerWarning[]
}
