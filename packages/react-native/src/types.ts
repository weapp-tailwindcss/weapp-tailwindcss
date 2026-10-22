import type { NativeCompilerWarning, NativeStyleRule } from '@weapp-tailwindcss/postcss/native'

export type { CompileNativeStylesheetOptions, NativeCompilerWarning, NativePlatform, NativeStyleRule } from '@weapp-tailwindcss/postcss/native'

/** 同一轮 Metro 发布的便携身份，不包含构建机器的文件路径。 */
export interface NativeManifestPublication {
  revision: string
  manifestSha256: string
}

export interface NativeStyleManifest {
  version: 1
  classSet: string[]
  rules: Record<string, NativeStyleRule[]>
  /** 可直接交给 StyleSheet.create 的稳定规则表。 */
  styleSheet?: Record<string, Record<string, unknown>>
  /** styleSheet 规则的条件和优先级元数据。 */
  styleEntries?: Record<string, NativeStyleRule>
  /** 每个 class token 对应的静态 style ID，Babel 编译结果直接使用它。 */
  staticLookup?: Record<string, string[]>
  variables: Record<string, string>
  warnings: NativeCompilerWarning[]
}
