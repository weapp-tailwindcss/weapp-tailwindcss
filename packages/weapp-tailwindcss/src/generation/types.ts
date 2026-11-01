import type { StyleHandler } from '@weapp-tailwindcss/postcss/transform'
import type { TailwindV4CssSource } from './source-resolver/types'
import type { GenerationStyleHandlerOptions } from './style-options'
import type { ResolvedCompilationProfile } from '@/compiler/compilation-profile'
import type { CompilationDependencyChange, SourceScope } from '@/compiler/index'
import type { CompilerTransformServices } from '@/compiler/transform-services'
import type { CompilerSnapshot } from '@/core/compiler/types'
import type { TailwindSourceEntry } from '@/tailwindcss/source-scan'
import type { TailwindcssRuntimeLike } from '@/types/compilation'

export interface GenerateCssByGeneratorOptions {
  profile: ResolvedCompilationProfile
  compilerTransforms: CompilerTransformServices
  isConfigurationCurrent: () => boolean
  sourceRuntimeState: { tailwindRuntime: TailwindcssRuntimeLike }
  runtimeState: {
    tailwindRuntime: TailwindcssRuntimeLike
    readyPromise: Promise<void>
  }
  runtime: Set<string>
  rawSource: string
  file: string
  cssHandlerOptions: GenerationStyleHandlerOptions
  cssUserHandlerOptions: GenerationStyleHandlerOptions
  cssSources?: TailwindV4CssSource[] | undefined
  getSourceCandidatesForEntries?: ((entries: TailwindSourceEntry[] | undefined) => Set<string>) | undefined
  sourceCandidates?: Set<string> | undefined
  compilation?: {
    changes?: CompilationDependencyChange[] | undefined
    enabled: boolean
    preserveDeletedCss: boolean
    scope: SourceScope
  } | undefined
  outputFile?: string | undefined
  styleHandler: StyleHandler
  debug: (format: string, ...args: unknown[]) => void
  generatorPlatform?: string | undefined
  userRawSource?: string | undefined
  userRawSourceProcessed?: boolean | undefined
  /** 框架已处理、需在最终合并前解析编译期函数的作者样式。 */
  frameworkProcessedUserCss?: string | undefined
  forceGenerator?: boolean | undefined
  previousCss?: string | undefined
  previousClassSet?: Set<string> | undefined
  incrementalCache?: boolean | undefined
  deferEmptyScopedCssSource?: boolean | undefined
  deferCssAdaptation?: boolean | undefined
  /** 通用 Web rpx 兜底等待框架单位转换完成，不延后显式单位规则。 */
  deferWebRpxConversion?: boolean | undefined
  /** 构建片段只保留注册证据，默认值由完整资产边界统一合成。 */
  deferWebCssPropertyFallback?: boolean | undefined
  disableSourceScan?: boolean | undefined
  restoreLocalCssImports?: boolean | undefined
}

export interface GenerateCssByGeneratorResult {
  css: string
  /** 当前生成入口中的 rpx 主题变量，交由最终适配阶段诊断。 */
  rpxThemeVariables?: string[] | undefined
  /** 已使用本轮 Tailwind 配置展开函数的框架作者样式。 */
  frameworkProcessedUserCss?: string | undefined
  /** 供 restore 在去掉生成段后编译作者函数。 */
  compileAuthorCssFunctions?: ((css: string) => Promise<string>) | undefined
  classSet: ReadonlySet<string>
  target: string
  source: 'generator'
  dependencies: string[]
  snapshot?: CompilerSnapshot | undefined
  incremental?: boolean | undefined
  metadata?: {
    file: string
    majorVersion?: number | undefined
    outputFile?: string | undefined
    preflightMode?: {
      inject: boolean
      preserve: boolean
    } | undefined
    rawCss?: string | undefined
    revision?: number | undefined
  } | undefined
}
