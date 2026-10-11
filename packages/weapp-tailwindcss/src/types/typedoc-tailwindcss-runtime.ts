import type { PackageResolvingOptions } from '../tailwindcss/package-options'
import type { TailwindSourceEntry as SourceEntry } from '../tailwindcss/source-scan'
import type { TailwindV4SourceOptions } from '../tailwindcss/v4-engine'
import type { LengthUnitsRuntimeOptions } from '@/tailwindcss/runtime-types'

type TailwindV4CssSource = NonNullable<TailwindV4SourceOptions['cssSources']>[number]

export type CacheStrategy = 'merge' | 'overwrite'
export type CacheDriver = 'file' | 'memory' | 'noop'

/**
 * Tailwind 类名缓存配置。
 */
export interface CacheOptions {
  /**
   * 是否启用缓存。
   */
  enabled?: boolean
  /**
   * 解析缓存路径时使用的工作目录。
   */
  cwd?: string
  /**
   * 缓存文件写入目录。
   */
  dir?: string
  /**
   * 缓存文件名。未传入时，会在推导出的缓存目录下使用 `class-cache.json`。
   */
  file?: string
  /**
   * 新类名列表与已有缓存合并时使用的策略。
   */
  strategy?: CacheStrategy
  /**
   * 缓存持久化方式。默认使用 `file`。
   */
  driver?: CacheDriver
}

/**
 * 类名提取结果的输出配置。
 */
export interface ExtractOptions {
  /**
   * 是否写出提取结果文件。
   */
  write?: boolean
  /**
   * 输出文件路径，可传绝对路径或相对路径。
   */
  file?: string
  /**
   * 输出格式。未传入时使用 JSON。
   */
  format?: 'json' | 'lines'
  /**
   * JSON 格式化缩进。传入可判定为真的值会启用缩进。
   */
  pretty?: number | boolean
  /**
   * 是否从最终列表中移除通配选择器 `*`。
   */
  removeUniversalSelector?: boolean
}

/**
 * 控制运行时 Tailwind context 暴露方式。
 */
export interface ExposeContextOptions {
  /**
   * 暴露 context 时使用的属性名。
   */
  refProperty?: string
}

/**
 * 扩展内置长度单位支持的默认值。
 */
export interface ExtendLengthUnitsOptions extends Partial<LengthUnitsRuntimeOptions> {
  /**
   * 是否启用长度单位支持。
   */
  enabled?: boolean
}

/**
 * Tailwind 运行时行为配置。
 */
export interface ApplyOptions {
  /**
   * 是否允许覆盖已有运行时缓存或上下文状态。
   */
  overwrite?: boolean
  /**
   * 是否暴露运行时 Tailwind context，或配置具体暴露方式。
   */
  exposeContext?: boolean | ExposeContextOptions
  /**
   * 扩展长度单位支持，传入 `false` 可完全关闭。
   */
  extendLengthUnits?: false | ExtendLengthUnitsOptions
}

export interface TailwindRuntimeOptionsBase {
  /**
   * Tailwind 配置文件路径。自动识别不够准确时可以显式传入。
   */
  config?: string
  /**
   * 解析 Tailwind 配置相对路径时使用的工作目录。
   */
  cwd?: string
  /**
   * 自定义 PostCSS 插件名称。未传入时使用默认名称。
   */
  postcssPlugin?: string
}

/**
 * Tailwind CSS v4 提取配置。
 */
export interface TailwindV4Options {
  /**
   * 解析 v4 内容来源与配置时使用的基准目录。
   */
  base?: string
  /**
   * 直接传给 v4 设计系统的原始 CSS。
   */
  css?: string
  /**
   * 构建器在 CSS 落盘前捕获的内存 CSS 入口。
   */
  cssSources?: TailwindV4CssSource[]
  /**
   * Tailwind CSS 4 入口文件列表，用于识别入口中的 `@import "tailwindcss"`、`@source` 与 `@config`。入口 CSS 仍然需要被项目实际 import 或纳入构建图，`cssEntries` 不会替代框架生成该 CSS 资产。
   *
   * 类型上保持可选，是为了兼容内存 CSS 来源；业务项目应显式传入绝对路径。多入口、分包、独立分包、Webpack/Gulp/自定义构建和多平台构建都应该写清楚这些入口。
   */
  cssEntries?: string[]
  /**
   * 覆盖 oxide 扫描器默认扫描的内容来源。
   */
  sources?: SourceEntry[]
  /**
   * 是否启用 UnoCSS 风格的裸任意值，例如 `p-10%`、`p-2.5px`。
   */
  bareArbitraryValues?: boolean | {
    /**
     * 识别裸任意值时允许的单位列表。
     */
    units?: string[]
  } | undefined
}

/**
 * 按 Tailwind 版本划分的运行时配置。
 */
export interface TailwindCssOptions extends TailwindRuntimeOptionsBase {
  /**
   * 当前项目使用的 Tailwind CSS 主版本。未传入时会从已安装包推断。
   */
  version?: 4
  /**
   * Tailwind 包名。项目使用分支包时可以改这里。
   */
  packageName?: string
  /**
   * 传给 `local-pkg` 的包解析配置。
   */
  resolve?: PackageResolvingOptions
  /**
   * Tailwind CSS v4 提取与 CSS 入口选项。
   */
  v4?: TailwindV4Options
}

/**
 * Tailwind CSS 运行时根配置。
 */
export interface TailwindCssRuntimeOptions {
  /**
   * 解析 Tailwind 资源时使用的项目根目录。默认是 `process.cwd()`。
   */
  projectRoot?: string
  /**
   * Tailwind 运行时配置。
   */
  tailwindcss?: TailwindCssOptions
  /**
   * 运行时行为开关。
   */
  apply?: ApplyOptions
  /**
   * 类名提取结果输出配置。
   */
  extract?: ExtractOptions
  /**
   * 过滤最终类名的函数。
   */
  filter?: (className: string) => boolean
  /**
   * 缓存配置。传入布尔值可快速启用或关闭。
   */
  cache?: boolean | CacheOptions
}
