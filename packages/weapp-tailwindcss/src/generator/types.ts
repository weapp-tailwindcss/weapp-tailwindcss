import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'
import type { WeappTailwindcssGeneratorTarget } from '@/compiler/target'
import type {
  TailwindV4CandidateSource,
  TailwindV4DesignSystem,
  TailwindV4Engine,
  TailwindV4GenerateOptions,
  TailwindV4GenerateResult,
  TailwindV4GenerateTarget,
  TailwindV4ResolvedSource,
  TailwindV4SourceOptions,
} from '@/tailwindcss/v4-engine/types'

export type { WeappTailwindcssGeneratorTarget }
export type TailwindGeneratorVersion = 4
export type TailwindCandidateSource = TailwindV4CandidateSource
export type TailwindResolvedSource = TailwindV4ResolvedSource

/**
 * weapp-tailwindcss 生成器的调用配置。
 */
export interface WeappTailwindcssGenerateOptions extends Omit<TailwindV4GenerateOptions, 'target'> {
  /**
   * 生成目标。`weapp` 输出小程序兼容 CSS，`web` 保留 Web 形态，`tailwind` 返回 Tailwind 原始输出。
   */
  target?: WeappTailwindcssGeneratorTarget | undefined
  /**
   * 传给小程序 CSS 兼容转换器的额外配置。
   */
  styleOptions?: Partial<IStyleHandlerOptions> | undefined
}

/**
 * weapp-tailwindcss 生成器的输出结果。
 */
export type WeappTailwindcssGenerateResult = TailwindV4GenerateResult & {
  /**
   * 实际生成目标。
   */
  target: WeappTailwindcssGeneratorTarget
  /**
   * Tailwind 原始输出 CSS。
   */
  rawCss: string
}

/**
 * weapp-tailwindcss 统一生成器实例。
 */
export interface WeappTailwindcssGenerator extends Omit<TailwindV4Engine, 'generate'> {
  /**
   * 生成目标 CSS。
   */
  generate: (options?: WeappTailwindcssGenerateOptions) => Promise<WeappTailwindcssGenerateResult>
}

export type {
  TailwindV4CandidateSource,
  TailwindV4DesignSystem,
  TailwindV4Engine,
  TailwindV4GenerateOptions,
  TailwindV4GenerateResult,
  TailwindV4GenerateTarget,
  TailwindV4ResolvedSource,
  TailwindV4SourceOptions,
}
