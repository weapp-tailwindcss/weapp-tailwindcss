import type { ParseError, ParserOptions } from '@babel/parser'
import type { CssPreflightOptions, IStyleHandlerOptions, StyleHandler } from '@weapp-tailwindcss/postcss/transform'
import type { SourceMap } from 'magic-string'
import type { ICreateCacheReturnType } from '../cache'
import type { ItemOrItemArray } from './base'
import type { AppType, IArbitraryValues, ICustomAttributesEntities } from './shared'
import type {
  UniAppXComponentLocalStylesOptions,
  UniAppXOptions as UniAppXUserDefinedOptions,
  UserDefinedOptions,
} from './user-defined-options'
import type {
  LengthUnitsRuntimeOptions,
  TailwindContentTokenReport,
  TailwindcssExtractOptions,
  TailwindcssExtractResult,
  TailwindCssOptions,
  TailwindCssRuntimeOptions,
  TailwindPackageInfo,
} from '@/tailwindcss/runtime-types'

export type {
  TailwindCssOptions,
  TailwindCssRuntimeOptions,
  UniAppXComponentLocalStylesOptions,
  UniAppXUserDefinedOptions,
  UserDefinedOptions,
}
export type { AppType, IArbitraryValues, ICustomAttributes, ICustomAttributesEntities, IUnocssCompatibilityOptions } from './shared'

// UserDefinedPostcssOptions：用户可配置的 PostCSS 选项
export type { CssPreflightOptions, IStyleHandlerOptions, ItemOrItemArray }
export type { WeappTailwindcssStyleInjectorOptions } from '@/style-injector/options'

export type RequiredDefined<T> = {
  [K in keyof T]-?: Exclude<T[K], undefined>
}

type InternalUserDefinedOptionsBase = RequiredDefined<
  Omit<
    UserDefinedOptions,
    | 'supportCustomLengthUnits'
    | 'customReplaceDictionary'
    | 'cache'
    | 'templateHandler'
    | 'styleHandler'
    | 'jsHandler'
  >
>

export interface LinkedJsModuleResult {
  code: string
}

export interface JsHandlerResult {
  code: string
  map?: SourceMap
  error?: ParseError
  /**
   * 因跨文件分析而被转换的额外模块，使用绝对文件路径作为键。
   */
  linked?: Record<string, LinkedJsModuleResult>
}

export interface TailwindcssRuntimeLike {
  packageInfo: TailwindPackageInfo
  majorVersion?: number | undefined
  getClassSet: () => Promise<Set<string>> | Set<string>
  getClassSetSync?: (() => Set<string>) | undefined
  extract: (options?: TailwindcssExtractOptions) => Promise<TailwindcssExtractResult> | TailwindcssExtractResult
  collectContentTokens?: (() => Promise<TailwindContentTokenReport> | TailwindContentTokenReport) | undefined
  options?: TailwindCssRuntimeOptions | undefined
}

export type BabelParserOptions = ParserOptions & {
  cache?: boolean | undefined
  cacheKey?: string | undefined
  cacheMaxEntries?: number | undefined
  cacheMaxSourceLength?: number | undefined
}

export interface RefreshTailwindcssRuntimeOptions {
  clearCache?: boolean | undefined
}

export interface IJsHandlerOptions {
  escapeMap?: Record<string, string> | undefined
  classNameSet?: Set<string> | undefined
  /**
   * @deprecated 为兼容旧配置保留。JS 转译不再允许绕过 classNameSet。
   */
  jsArbitraryValueFallback?: boolean | 'auto' | undefined
  /**
   * 当前 TailwindCSS 主版本号。为兼容旧的 JS handler 调用保留，不参与类名命中判断。
   */
  tailwindcssMajorVersion?: number | undefined
  arbitraryValues?: IArbitraryValues | undefined
  jsPreserveClass?: ((keyword: string) => boolean | undefined) | undefined
  needEscaped?: boolean | undefined
  generateMap?: boolean | undefined
  alwaysEscape?: boolean | undefined
  unescapeUnicode?: boolean | undefined
  babelParserOptions?: BabelParserOptions | undefined
  /**
   * 实验性 JS 解析快路径。当前仅在无 source map、无模块图与无 ignore 语义时尝试 OXC。
   */
  experimentalJsFastPath?: boolean | 'oxc' | undefined
  ignoreTaggedTemplateExpressionIdentifiers?: (string | RegExp)[] | undefined
  ignoreCallExpressionIdentifiers?: (string | RegExp)[] | undefined
  uniAppX?: boolean | undefined
  moduleSpecifierReplacements?: Record<string, string> | undefined
  /**
   * 为 `true` 时将输入视作独立表达式，而非完整的程序。
   * 适用于 `:class="{ 'foo bar': cond }"` 等模板绑定场景。
   */
  wrapExpression?: boolean | undefined
  /**
   * 当前正在转换的模块绝对路径。
   * 启用跨文件分析时必须提供。
   */
  filename?: string | undefined
  /**
   * 配置跨文件模块图分析行为。
   */
  moduleGraph?: JsModuleGraphOptions | undefined
}

export interface JsHandler {
  (
    rawSource: string,
    set?: Set<string>,
    options?: CreateJsHandlerOptions
  ): JsHandlerResult
}

export interface ICommonReplaceOptions {
  keepEOL?: boolean | undefined
  escapeMap?: Record<string, string> | undefined
}

export interface ITemplateHandlerOptions extends ICommonReplaceOptions {
  /**
   * `exact` 仅转换 runtimeSet 精确命中的静态 class；默认 `all` 保持旧 API 行为。
   */
  classSetMode?: 'all' | 'exact' | undefined
  customAttributesEntities?: ICustomAttributesEntities | undefined
  escapeMap?: Record<string, string> | undefined
  inlineWxs?: boolean | undefined
  jsHandler?: JsHandler | undefined
  runtimeSet?: Set<string> | undefined
  disabledDefaultTemplateHandler?: boolean | undefined
  quote?: string | null | undefined
  // 是否转译首字母，默认转译，传入 true 不转
  ignoreHead?: boolean | undefined
  wrapExpression?: boolean | undefined
  /** 当前正在转换的模板模块标识。 */
  filename?: string | undefined
}

export interface InternalUserDefinedOptions extends InternalUserDefinedOptionsBase {
  customAttributesEntities: ICustomAttributesEntities
  supportCustomLengthUnits: LengthUnitsRuntimeOptions | boolean
  templateHandler: (rawSource: string, options?: ITemplateHandlerOptions) => Promise<string>
  styleHandler: StyleHandler
  jsHandler: JsHandler
  escapeMap: Record<string, string>
  customReplaceDictionary: Record<string, string>
  cache: ICreateCacheReturnType
  tailwindRuntime: TailwindcssRuntimeLike
  refreshTailwindcssRuntime: (options?: RefreshTailwindcssRuntimeOptions) => Promise<TailwindcssRuntimeLike>
}

export type InternalPostcssOptions = Pick<
  UserDefinedOptions,
  'cssMatcher' | 'mainCssChunkMatcher' | 'cssPreflight' | 'cssPreflightRange' | 'disabled'
>

export interface IBaseWebpackPlugin {
  // 构造函数签名示例：new (options: UserDefinedOptions, appType: AppType): any
  // 或 constructor(options: UserDefinedOptions, appType: AppType): void
  options: InternalUserDefinedOptions
  appType?: AppType | undefined

  apply: (compiler: any) => void
}

export type CreateJsHandlerOptions = Omit<IJsHandlerOptions, 'classNameSet'>

export interface JsModuleGraphOptions {
  /**
   * 将导入的标识符解析为绝对文件路径。
   */
  resolve: (specifier: string, importer: string) => string | undefined
  /**
   * 同步加载模块源码。
   */
  load: (id: string) => string | undefined
  /**
   * 可选过滤器，用于跳过特定模块。
   */
  filter?: ((id: string, specifier: string, importer: string) => boolean) | undefined
  /**
   * 最大遍历深度，默认无限制（`Infinity`）。
   */
  maxDepth?: number | undefined
}
