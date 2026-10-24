import type { CssPreflightOptions, IStyleHandlerOptions, StyleHandler } from '@weapp-tailwindcss/postcss/transform'
import type { ICreateCacheReturnType } from '../cache'
import type { ItemOrItemArray } from './base'
import type { ITemplateHandlerOptions, JsHandler, RefreshTailwindcssRuntimeOptions, TailwindcssRuntimeLike } from './compilation'
import type { AppType, ICustomAttributesEntities } from './shared'
import type {
  UniAppXComponentLocalStylesOptions,
  UniAppXOptions as UniAppXUserDefinedOptions,
  UserDefinedOptions,
} from './user-defined-options'
import type {
  LengthUnitsRuntimeOptions,
  TailwindCssOptions,
  TailwindCssRuntimeOptions,
} from '@/tailwindcss/runtime-types'

export type * from './compilation'

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
