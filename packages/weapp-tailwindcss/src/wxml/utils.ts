import type { ITemplateHandlerOptions } from '../types'
import { defuOverrideArray } from '@weapp-tailwindcss/shared'
import { createAttributeMatcher, isPropsMatch } from './custom-attributes'
import { generateCode } from './utils/codegen'
import { customTemplateHandler } from './utils/custom-template'
import { templateReplacer } from './utils/template-fragments'

export { isPropsMatch }
export { customTemplateHandler, generateCode, templateReplacer }

export function createTemplateHandler(options: Omit<ITemplateHandlerOptions, 'runtimeSet'> = {}) {
  // 预构建 attribute matcher，避免每次处理文件都重建
  const cachedMatcher = createAttributeMatcher(
    options.customAttributesEntities,
  )
  const defaultOptions: ITemplateHandlerOptions = options
  let cachedRuntimeSet: Set<string> | undefined
  let cachedOptionsWithRuntimeSet: ITemplateHandlerOptions | undefined

  return (rawSource: string, opt?: ITemplateHandlerOptions) => {
    const runtimeSet = opt?.runtimeSet
    if (opt && Object.keys(opt).some(key => key !== 'runtimeSet')) {
      const resolvedOptions = defuOverrideArray(opt, defaultOptions)
      return customTemplateHandler(
        rawSource,
        resolvedOptions,
        opt.customAttributesEntities === undefined ? cachedMatcher : undefined,
      )
    }
    if (runtimeSet === undefined) {
      return customTemplateHandler(rawSource, defaultOptions, cachedMatcher)
    }

    if (cachedRuntimeSet !== runtimeSet || !cachedOptionsWithRuntimeSet) {
      cachedRuntimeSet = runtimeSet
      cachedOptionsWithRuntimeSet = {
        ...defaultOptions,
        runtimeSet,
      }
    }

    return customTemplateHandler(rawSource, cachedOptionsWithRuntimeSet, cachedMatcher)
  }
}
