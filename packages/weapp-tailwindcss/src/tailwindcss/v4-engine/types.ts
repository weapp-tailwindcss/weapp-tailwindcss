import type {
  TailwindV4Engine as EngineTailwindV4Engine,
  TailwindV4GenerateOptions as EngineTailwindV4GenerateOptions,
  TailwindV4GenerateResult as EngineTailwindV4GenerateResult,
  TailwindV4ResolvedSource as EngineTailwindV4ResolvedSource,
  TailwindV4SourceOptions as EngineTailwindV4SourceOptions,
  TailwindV4CandidateSource,
  TailwindV4DesignSystem,
} from '@weapp-tailwindcss/engine'
import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'

export type TailwindV4GenerateTarget = 'weapp' | 'web'

/**
 * Tailwind CSS v4 解析出的文件扫描规则。
 */
export interface TailwindV4SourcePattern {
  /**
   * glob 规则的基准目录。
   */
  base: string
  /**
   * glob 匹配规则。
   */
  pattern: string
  /**
   * 是否为排除规则。
   */
  negated: boolean
}

type TailwindV4EngineGenerateOptions = Omit<EngineTailwindV4GenerateOptions, 'target' | 'styleOptions' | 'scanSources' | 'bareArbitraryValues'>
export type TailwindV4SourceOptions = EngineTailwindV4SourceOptions
export type TailwindV4CssSource = NonNullable<TailwindV4SourceOptions['cssSources']>[number]

/**
 * weapp-tailwindcss 在 Tailwind v4 engine source 基础上附加的运行时来源信息。
 */
export interface TailwindV4ResolvedSource extends EngineTailwindV4ResolvedSource {
  /** 源码扫描阶段从入口依赖图收集的 rpx 主题变量。 */
  rpxThemeVariables?: string[] | undefined
  cwd?: string | undefined
  projectRoot: string
  cssSources?: TailwindV4CssSource[] | undefined
  sources?: TailwindV4SourcePattern[] | undefined
}

/**
 * Tailwind CSS v4 生成配置。
 */
export interface TailwindV4GenerateOptions extends TailwindV4EngineGenerateOptions {
  /** 使用生成会话的编译来源；适用于 CLI 等完整项目输入。 */
  scanMode?: 'compiled' | undefined

  /**
   * 是否启用增量生成缓存。
   */
  incrementalCache?: boolean | undefined
  /**
   * 是否启用 UnoCSS 风格的裸任意值，例如 `p-10%`、`p-2.5px`。
   */
  bareArbitraryValues?: EngineTailwindV4GenerateOptions['bareArbitraryValues'] | undefined
  /**
   * 生成目标。
   */
  target?: TailwindV4GenerateTarget | undefined
  /**
   * 传给小程序 CSS 兼容转换器的额外配置。
   */
  styleOptions?: Partial<IStyleHandlerOptions> | undefined
  /**
   * 是否扫描文件系统中的源码入口。
   */
  scanSources?: EngineTailwindV4GenerateOptions['scanSources'] | undefined
}

/**
 * 带显式来源规则的 Tailwind CSS v4 来源配置。
 */
export interface TailwindV4SourceOptionsWithSources extends TailwindV4SourceOptions {
  /**
   * 显式传入的文件扫描规则。
   */
  sources?: TailwindV4SourcePattern[] | undefined
}

/**
 * Tailwind CSS v4 生成结果。
 */
export interface TailwindV4GenerateResult extends Omit<EngineTailwindV4GenerateResult, 'css'> {
  /**
   * 转换后的 CSS。
   */
  css: string
  /**
   * Tailwind 原始输出 CSS。
   */
  rawCss: string
  /** 构建期解析出的 CSS 自定义属性上下文，供延后小程序样式适配使用。 */
  customPropertyValues?: ReadonlyMap<string, string> | undefined
  /** 保留变量声明作用域的原始上下文；推导声明不得当作显式常量覆盖。 */
  customPropertyContextCss?: string | undefined
  /**
   * 本次增量新增的转换后 CSS。
   */
  incrementalCss?: string | undefined
  /**
   * 本次增量新增的 Tailwind 原始 CSS。
   */
  incrementalRawCss?: string | undefined
  /**
   * 实际生成目标。
   */
  target: TailwindV4GenerateTarget
}

/**
 * Tailwind CSS v4 生成引擎。
 */
export interface TailwindV4Engine extends Omit<EngineTailwindV4Engine, 'generate'> {
  /**
   * 解析后的 Tailwind v4 source。
   */
  source: TailwindV4ResolvedSource
  /**
   * 生成 CSS。
   */
  generate: (options?: TailwindV4GenerateOptions) => Promise<TailwindV4GenerateResult>
  /**
   * 释放生成会话及其缓存。
   */
  dispose?: () => void
}

export type {
  TailwindV4CandidateSource,
  TailwindV4DesignSystem,
}
