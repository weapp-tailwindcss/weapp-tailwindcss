import type { IStyleHandlerOptions, WebCssCompatUserOptions } from '../types'

export type WeappTailwindcssPostcssTarget = 'weapp' | 'web'

export interface TailwindCandidateSource {
  content: string
  extension?: string | undefined
}

export interface WeappTailwindcssPostcssGenerateOptions {
  scanMode?: 'compiled' | undefined
  excludeFiles?: string[] | undefined
  candidates?: Iterable<string> | undefined
  scanSources?: boolean | undefined
  sources?: TailwindCandidateSource[] | undefined
  styleOptions?: Partial<IStyleHandlerOptions> | undefined
  target?: WeappTailwindcssPostcssTarget | undefined
}

export interface WeappTailwindcssPostcssGenerateResult {
  css: string
  rawCss: string
  target: WeappTailwindcssPostcssTarget
  classSet: Set<string>
  dependencies: string[]
}

export interface WeappTailwindcssPostcssGenerator {
  dispose?: (() => void) | undefined
  generate: (options?: WeappTailwindcssPostcssGenerateOptions) => Promise<WeappTailwindcssPostcssGenerateResult>
}

export interface TailwindV4SourceOptions {
  projectRoot?: string | undefined
  base?: string | undefined
  css?: string | undefined
  packageName?: string | undefined
}

export type TailwindResolvedSource = unknown

export interface WeappTailwindcssPostcssGeneratorUserOptions {
  target?: WeappTailwindcssPostcssTarget | undefined
  config?: string | undefined
  styleOptions?: Partial<IStyleHandlerOptions> | undefined
  webCompat?: WebCssCompatUserOptions | undefined
  importFallback?: boolean | undefined
  bareArbitraryValues?: unknown
}

export interface NormalizedWeappTailwindcssPostcssGeneratorOptions {
  target: WeappTailwindcssPostcssTarget
  config?: string | undefined
  styleOptions?: Partial<IStyleHandlerOptions> | undefined
  webCompat: WebCssCompatUserOptions | undefined
  importFallback: boolean
  bareArbitraryValues?: unknown
}

export interface WeappTailwindcssPostcssPluginAdapters {
  /** 生成器支持在编译会话内复用来源扫描；省略时保留旧适配协议。 */
  compiledSourceScan?: boolean | undefined
  createGenerator: (source: TailwindResolvedSource) => WeappTailwindcssPostcssGenerator
  normalizeGeneratorOptions: (
    options: WeappTailwindcssPostcssGeneratorUserOptions | undefined,
  ) => NormalizedWeappTailwindcssPostcssGeneratorOptions
  resolveTailwindV4Source: (options: TailwindV4SourceOptions) => Promise<TailwindResolvedSource>
}

/**
 * `weapp-tailwindcss` PostCSS 插件配置。
 */
export interface WeappTailwindcssPostcssPluginOptions extends TailwindV4SourceOptions {
  /**
   * 生成器配置，用于控制目标端和 Tailwind 配置路径。
   */
  generator?: WeappTailwindcssPostcssGeneratorUserOptions | undefined
  /**
   * Tailwind 配置文件路径。
   */
  config?: string | undefined
  /**
   * Tailwind PostCSS 插件名称。
   */
  postcssPlugin?: string | undefined
  /**
   * 额外传入的候选类名。
   */
  candidates?: Iterable<string> | undefined
  /**
   * 是否扫描 Tailwind v4 源码入口中的候选类名。
   */
  scanSources?: WeappTailwindcssPostcssGenerateOptions['scanSources']
  /**
   * 额外传入的 Tailwind v4 内联候选来源。
   */
  sources?: TailwindCandidateSource[] | undefined
  /**
   * 传给小程序 CSS 兼容转换器的额外配置。
   */
  styleOptions?: Partial<IStyleHandlerOptions> | undefined
}
