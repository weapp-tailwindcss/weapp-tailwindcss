import type {
  Document,
  FinalizeMiniProgramCssOptions,
  IStyleHandlerOptions,
  Result as PostcssResult,
  Root,
} from '@weapp-tailwindcss/postcss/transform'
import type { CacheTelemetryCollector } from '@/compiler/cache-telemetry'
import type {
  TailwindV4ResolvedSource,
  TailwindV4SourceOptions,
  WeappTailwindcssGenerateOptions,
  WeappTailwindcssGenerateResult,
} from '@/generator'
import type {
  CreateJsHandlerOptions,
  ITemplateHandlerOptions,
  JsHandlerResult,
  UserDefinedOptions,
} from '@/types'

export type CompilerTarget = 'tailwind' | 'weapp' | 'web'

export type CompilerSourcePattern = NonNullable<TailwindV4ResolvedSource['sources']>[number]

export interface CompilerSnapshotRoot {
  id: string
  revision: number
}

/**
 * 一次生成事务的只读转换凭据。
 */
export interface CompilerSnapshot {
  readonly classSet: ReadonlySet<string>
  readonly dependencies: readonly string[]
  readonly roots: readonly CompilerSnapshotRoot[]
  readonly sources: readonly CompilerSourcePattern[]
  readonly target: CompilerTarget
}

interface CompilerGenerateRequestBase extends Omit<WeappTailwindcssGenerateOptions, 'target'> {
  /** 调用方定义的逻辑样式 root ID；core 不会规范化该值。 */
  id: string
  target?: CompilerTarget | undefined
}

export type CompilerGenerateRequest
  = | CompilerGenerateRequestBase & {
    source: TailwindV4ResolvedSource
    sourceOptions?: never
  }
  | CompilerGenerateRequestBase & {
    source?: never
    sourceOptions: TailwindV4SourceOptions
  }

export interface CompilerCacheReuseState {
  /** 是否命中了上一次解析后的 source 指纹。 */
  source: boolean
  /** 是否复用了当前 root 的 Tailwind engine 与 Scanner。 */
  engine: boolean
  /** 是否命中了没有新增 CSS 的增量结果。 */
  output: boolean
}

export interface CompilerGenerateResult extends Omit<
  WeappTailwindcssGenerateResult,
  'classSet' | 'dependencies' | 'rawCandidates' | 'sources' | 'target'
> {
  cache: Readonly<CompilerCacheReuseState>
  classSet: ReadonlySet<string>
  dependencies: readonly string[]
  rawCandidates: ReadonlySet<string>
  revision: number
  snapshot: CompilerSnapshot
  sources: readonly CompilerSourcePattern[]
  target: CompilerTarget
}

export interface CreateCompilerSnapshotRequest {
  classSet: Iterable<string>
  dependencies?: Iterable<string> | undefined
  id: string
  revision?: number | undefined
  sources?: Iterable<CompilerSourcePattern> | undefined
  target?: CompilerTarget | undefined
}

export type CompilerTemplateTransformOptions = Omit<ITemplateHandlerOptions, 'classSetMode' | 'runtimeSet'>

export type CompilerCssTransformOptions = Partial<IStyleHandlerOptions> & {
  /** 是否在样式兼容转换后执行小程序 CSS 最终化。 */
  finalize?: boolean | undefined
}

export type CreateCompilerOptions = UserDefinedOptions & {
  compiler?: {
    /** 长期未使用且没有进行中任务的 root 会话上限。 */
    maxRoots?: number | undefined
    /** root 因超过 maxRoots 被淘汰并释放后触发。 */
    onRootEvicted?: ((id: string) => void) | undefined
    /** 可选的缓存遥测采集器。 */
    cacheTelemetry?: CacheTelemetryCollector | undefined
  } | undefined
}

export interface Compiler {
  createSnapshot: (request: CreateCompilerSnapshotRequest) => CompilerSnapshot
  dispose: () => Promise<void>
  finalizeCss: (css: string, options?: FinalizeMiniProgramCssOptions) => string
  finalizeCssRoot: (root: Root, options?: FinalizeMiniProgramCssOptions) => Root
  generate: (request: CompilerGenerateRequest) => Promise<CompilerGenerateResult>
  invalidate: (ids: Iterable<string>) => readonly string[]
  mergeSnapshots: (snapshots: Iterable<CompilerSnapshot>) => CompilerSnapshot
  remove: (id: string) => Promise<void>
  transformCss: (
    css: string,
    snapshot: CompilerSnapshot,
    options?: CompilerCssTransformOptions,
  ) => Promise<PostcssResult<Root | Document>>
  transformCssRoot: (
    root: Root,
    snapshot: CompilerSnapshot,
    options?: CompilerCssTransformOptions,
  ) => Promise<PostcssResult<Root>>
  transformJavaScript: (
    source: string,
    snapshot: CompilerSnapshot,
    options?: CreateJsHandlerOptions,
  ) => Promise<JsHandlerResult>
  transformTemplate: (
    source: string,
    snapshot: CompilerSnapshot,
    options?: CompilerTemplateTransformOptions,
  ) => Promise<string>
}
