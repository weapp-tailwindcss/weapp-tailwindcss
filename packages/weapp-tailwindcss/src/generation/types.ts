import type { TailwindV4CssSource } from './source-resolver/types'
import type { GenerationStyleHandlerOptions } from './style-options'
import type { CompilationDependencyChange, SourceScope } from '@/compiler/index'
import type { CompilerSnapshot } from '@/core/compiler/index'
import type { TailwindSourceEntry } from '@/tailwindcss/source-scan'
import type { InternalUserDefinedOptions } from '@/types/index'

export interface GenerateCssByGeneratorOptions {
  opts: InternalUserDefinedOptions
  runtimeState: {
    tailwindRuntime: InternalUserDefinedOptions['tailwindRuntime']
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
  styleHandler: InternalUserDefinedOptions['styleHandler']
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
