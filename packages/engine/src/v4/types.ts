import type { Root } from 'postcss'
import type { TailwindStyleSource } from '../style-candidates.ts'

export interface TailwindV4SourceOptions {
  projectRoot?: string
  cwd?: string
  base?: string
  baseFallbacks?: string[]
  css?: string
  cssSources?: TailwindV4CssSource[]
  cssEntries?: string[]
  packageName?: string
}

export interface TailwindV4CssSource {
  css: string
  base?: string
  file?: string
  dependencies?: string[]
}

export interface TailwindV4ResolvedSource {
  projectRoot: string
  base: string
  baseFallbacks: string[]
  css: string
  dependencies: string[]
}

export interface TailwindV4CandidateSource {
  content: string
  extension?: string
}

export interface SourceEntry extends TailwindV4CandidateSource {
  id: string
}

export interface GenerationRequest {
  /** 使用当前编译会话解析的来源扫描，避免调用方预编译入口。 */
  scanSources?: boolean | TailwindV4SourcePattern[]
  /** 构建输出等明确不能作为输入的文件。 */
  excludeFiles?: string[]
  /** 平台适配器在验证候选之前归一化候选；不负责生成新来源。 */
  prepareCandidates?: (candidates: Set<string>) => Iterable<string>

  candidates?: Iterable<string>
  sourceEntries?: SourceEntry[]
  /**
   * 启用 UnoCSS 风格的裸任意值，例如 `p-10%`、`p-2.5px`。
   */
  bareArbitraryValues?: TailwindV4GenerateOptions['bareArbitraryValues']
}

export type GenerationChange
  = | { type: 'all' }
    | { type: 'candidates' }
    | { type: 'sourceEntries' }
    | { type: 'dependencies', paths?: Iterable<string> }
    | { type: 'source', source: TailwindV4ResolvedSource }

export type CssFragmentKind = 'tailwind' | 'theme' | 'preflight'

export interface CssFragment {
  id: string
  kind: CssFragmentKind
  root: Root
  sourceId: string
  order: number
}

export interface TailwindGenerationArtifact {
  fragments: CssFragment[]
  classSet: Set<string>
  rawCandidates: Set<string>
  dependencies: string[]
  sourceEntries: SourceEntry[]
}

export interface TailwindGenerationSessionOptions {
  /**
   * 使用当前实际编译来源的 design system 准备 CSS，结果与候选校验共享该实例。
   * 仅允许调整生成规则的顺序或非语义标记，不能改变主题、utility、variant、
   * 配置、插件、导入或来源指令；其他来源元数据由会话保留。
   * 回调及其闭包配置在会话存活期间必须保持不变。
   */
  prepareSource?: ((source: Readonly<TailwindV4ResolvedSource>, designSystem: TailwindV4DesignSystem) => string | Promise<string>) | undefined
}

export interface TailwindGenerationSession {
  readonly source: TailwindV4ResolvedSource
  generate: (request?: GenerationRequest) => Promise<TailwindGenerationArtifact>
  invalidate: (change: GenerationChange) => void
  dispose: () => void
}

export interface TailwindV4StyleSource extends TailwindStyleSource {}

export interface TailwindV4GenerateOptions {
  /** 从候选扫描中排除的输出文件。 */
  excludeFiles?: string[]

  candidates?: Iterable<string>
  sources?: TailwindV4CandidateSource[]
  /**
   * 启用 UnoCSS 风格的裸任意值，例如 `p-10%`、`p-2.5px`。
   */
  bareArbitraryValues?: boolean | {
    units?: string[]
  }
  /**
   * 扫描文件系统 source entries 中的候选类名。
   *
   * - `true`：使用 Tailwind v4 编译入口解析出的 `@source` 列表。
   * - `TailwindV4SourcePattern[]`：使用调用方显式传入的 source 列表。
   */
  scanSources?: boolean | TailwindV4SourcePattern[]
}

export type TailwindV4CompiledSourceRoot = null | 'none' | {
  base: string
  pattern: string
}

export interface TailwindV4SourcePattern {
  base: string
  pattern: string
  negated: boolean
}

export interface TailwindV4GenerateResult {
  css: string
  classSet: Set<string>
  rawCandidates: Set<string>
  dependencies: string[]
  sources: TailwindV4SourcePattern[]
  root: TailwindV4CompiledSourceRoot
}

export interface TailwindV4StyleGenerateOptions extends TailwindV4SourceOptions {
  source?: TailwindV4ResolvedSource
  candidates?: Iterable<string>
  sources?: TailwindV4StyleSource[]
  /**
   * 启用 UnoCSS 风格的裸任意值，例如 `p-10%`、`p-2.5px`。
   */
  bareArbitraryValues?: TailwindV4GenerateOptions['bareArbitraryValues']
  /**
   * 除内存来源外，还扫描 Tailwind CSS v4 编译后解析的来源入口。
   */
  scanSources?: TailwindV4GenerateOptions['scanSources']
}

export interface TailwindV4StyleGenerateResult extends TailwindV4GenerateResult {
  tokens: Set<string>
  source: TailwindV4ResolvedSource
}

export interface TailwindV4DesignSystem {
  parseCandidate: (candidate: string) => unknown[]
  candidatesToCss: (candidates: string[]) => Array<string | null | undefined>
  /** 当前候选集合的生成顺序；可选以兼容只提供校验能力的实现。 */
  getClassOrder?: ((candidates: string[]) => Array<[string, bigint | null]>) | undefined
}

export interface TailwindV4Engine {
  /** 释放内部生成会话；可选以兼容自定义引擎实现。 */
  dispose?: () => void
  source: TailwindV4ResolvedSource
  loadDesignSystem: () => Promise<TailwindV4DesignSystem>
  validateCandidates: (candidates: Iterable<string>) => Promise<Set<string>>
  generate: (options?: TailwindV4GenerateOptions) => Promise<TailwindV4GenerateResult>
}
