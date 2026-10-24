import type { CssPreflightOptions, IStyleHandlerOptions, WebCssCompatUserOptions } from '@weapp-tailwindcss/postcss/types'
import type { FrameworkPolicy } from './framework-policy'
import type { RuntimeBranch } from './target'
import type { CompilerMode } from './types'
import type { IArbitraryValues } from '@/types/shared'

/** 已解析的生成配置；不携带框架身份或环境读取能力。 */
export interface ResolvedGeneratorOptions {
  enabled: boolean
  target: 'weapp' | 'web'
  branch: RuntimeBranch
  config?: string | undefined
  styleOptions?: Partial<IStyleHandlerOptions> | undefined
  webCompat: WebCssCompatUserOptions | undefined
  hmr: { preserveDeletedCss: boolean }
  importFallback: boolean
  bareArbitraryValues?: IArbitraryValues['bareArbitraryValues'] | undefined
}

/** 每次编译请求固定的配置快照；可变编译状态由实例会话单独持有。 */
export interface ResolvedCompilationProfile {
  readonly revision: number
  readonly generator: Readonly<ResolvedGeneratorOptions>
  readonly policy: FrameworkPolicy
  readonly styleOptions: Readonly<Partial<IStyleHandlerOptions> & { webRpxCompatibility: boolean }>
  readonly cssPreflight: CssPreflightOptions
  readonly cssEntries: readonly string[] | undefined
  readonly escapeMap: Readonly<Record<string, string>>
  readonly compilerMode: CompilerMode
  readonly sourceConcurrency: number
  readonly checkRpxThemeRisk: boolean
  readonly stylesEmbeddedInScript: boolean
}
