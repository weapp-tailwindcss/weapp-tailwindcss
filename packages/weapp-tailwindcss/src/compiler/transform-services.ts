import type { StyleHandler } from '@weapp-tailwindcss/postcss/transform'
import type { ITemplateHandlerOptions, JsHandler } from '@/types/compilation'

/** 核心转换操作由实例创建；不包含用户配置、环境或共享缓存。 */
export interface CompilerTransformServices {
  readonly styleHandler: StyleHandler
  readonly jsHandler: JsHandler
  readonly templateHandler: (source: string, options?: ITemplateHandlerOptions) => Promise<string>
  readonly skyline?: boolean | undefined
  readonly stylePlatform?: string | undefined
  readonly preserveWebkitProperties?: readonly string[] | undefined
}
