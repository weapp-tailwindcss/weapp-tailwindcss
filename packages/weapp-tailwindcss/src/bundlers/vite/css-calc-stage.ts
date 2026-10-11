import type { IStyleHandlerOptions, StyleHandler } from '@weapp-tailwindcss/postcss/types'
import type { InternalUserDefinedOptions } from '@/types'
import { resolveStyleOptionsFromContext } from '@/context/style-options'
import { resolveUniUtsPlatform } from '@/utils'

const deferredKeys = ['cssCalc', 'rem2rpx', 'px2rpx', 'unitsToPx', 'unitConversion'] as const
const deferredKeySet = new Set<PropertyKey>(deferredKeys)
const deferredOptions = Object.fromEntries(deferredKeys.map(key => [key, false]))

export interface ViteCssCalcStage {
  options: InternalUserDefinedOptions
  getFinalOptions: () => Partial<IStyleHandlerOptions> | undefined
  shouldDefer: () => boolean
}

/** 构建中保留原始单位和表达式；最终输出阶段仍读取用户的真实配置。 */
export function createViteCssCalcStage(
  original: InternalUserDefinedOptions,
  isBuild: () => boolean,
  getPlatform: () => string | undefined = () => undefined,
): ViteCssCalcStage {
  const resolveFinalOptions = () => resolveStyleOptionsFromContext(
    original,
    original.tailwindRuntime.majorVersion,
    original.cssOptions?.platform ?? original.platform ?? getPlatform(),
  )
  const shouldDefer = () => {
    if (!isBuild()) {
      return false
    }
    const finalOptions = resolveFinalOptions()
    // 原生样式可能嵌入 JS/UTS，不能延迟到只处理 CSS 资产的阶段。
    return Boolean(finalOptions.cssCalc)
      && finalOptions.uniAppX !== true
      && !resolveUniUtsPlatform(finalOptions.platform).isApp
  }
  const defer = (options?: Partial<IStyleHandlerOptions>): Partial<IStyleHandlerOptions> | undefined => shouldDefer()
    ? { ...options, ...deferredOptions, cssOptions: { ...options?.cssOptions, ...deferredOptions } }
    : options
  // 原处理器已经闭包捕获用户配置，必须同时覆盖调用参数，不能只替换 opts 字段。
  const styleHandler: StyleHandler = Object.assign(
    (css: string, options?: Partial<IStyleHandlerOptions>) => original.styleHandler(css, defer(options)),
    {
      transformRoot: ((root, options) => original.styleHandler.transformRoot(root, defer(options))) as StyleHandler['transformRoot'],
      getPipeline: (options => original.styleHandler.getPipeline(defer(options))) as StyleHandler['getPipeline'],
    },
  )
  const options = new Proxy(original, {
    get(target, key, receiver) {
      if (key === 'styleHandler') {
        return styleHandler
      }
      // 其他选项不受延后阶段影响，不能每次读取都重新构造完整平台/样式配置。
      if ((key === 'cssOptions' || deferredKeySet.has(key)) && shouldDefer()) {
        if (deferredKeySet.has(key)) {
          return false
        }
        if (key === 'cssOptions') {
          return { ...target.cssOptions, ...deferredOptions }
        }
      }
      return Reflect.get(target, key, receiver)
    },
  })
  return {
    options,
    getFinalOptions: () => shouldDefer()
      ? {
          ...resolveFinalOptions(),
          customPropertyValues: (original as Partial<IStyleHandlerOptions>).customPropertyValues,
        }
      : undefined,
    shouldDefer,
  }
}
