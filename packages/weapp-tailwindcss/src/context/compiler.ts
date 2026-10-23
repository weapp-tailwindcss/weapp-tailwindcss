import type { CreateCompilerOptions } from './compiler-options'
import type { CompilerTransformServices } from '@/compiler/transform-services'
import type { InternalUserDefinedOptions } from '@/types'
import { createResolvedCompiler } from '@/core/compiler/compiler'
import { createCompilerContext } from './index'

/** 从已独占的上下文投影核心需要的转换服务。 */
export function createCompilerTransformServices(context: InternalUserDefinedOptions): CompilerTransformServices {
  return {
    styleHandler: context.styleHandler,
    jsHandler: context.jsHandler,
    templateHandler: context.templateHandler,
    preserveWebkitProperties: context.cssOptions?.preserveWebkitProperties,
  }
}

/** 公开兼容入口只负责配置解析与独立实例组装。 */
export function createCompiler(options: CreateCompilerOptions = {}) {
  const { compiler, ...userOptions } = options
  const context = createCompilerContext({ ...userOptions, __internalDeferMissingCssEntriesWarning: true } as typeof userOptions)
  return createResolvedCompiler({ transforms: createCompilerTransformServices(context), compiler })
}
