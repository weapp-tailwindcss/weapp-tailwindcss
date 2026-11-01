// 构建像素到 rpx 的转换插件，默认贴合小程序设计稿尺寸
import type { AcceptedPlugin } from 'postcss'
import type { PxTransformOptions } from 'postcss-pxtrans'
import type { IStyleHandlerOptions } from '../types'
import { defuOverrideArray } from '@weapp-tailwindcss/shared'
import postcssPxtrans from 'postcss-pxtrans'

const defaultPxTransformOptions: PxTransformOptions = {
  platform: 'weapp',
  targetUnit: 'rpx',
  transformVarFallbacks: true,
  unitPrecision: 5,
  propList: ['*'],
  selectorBlackList: [],
  replace: true,
  mediaQuery: false,
  minPixelValue: 0,
  designWidth: 750,
  deviceRatio: {
    375: 2,
    640: 2.34 / 2,
    750: 1,
    828: 1.81 / 2,
  },
}

/** 动态设计稿的派生倍率属于本轮处理，不以函数身份证明结果可复用。 */
export function hasDynamicPxDesignWidth(options: Pick<IStyleHandlerOptions, 'px2rpx'>): boolean {
  const px2rpx = options.px2rpx
  return Boolean(px2rpx && typeof px2rpx === 'object'
    && typeof px2rpx.designWidth === 'function'
    && px2rpx.rootValue === undefined
    && px2rpx.root_value === undefined)
}

export function getPxTransformPlugin(options: IStyleHandlerOptions): AcceptedPlugin | null {
  if (!options.px2rpx) {
    return null
  }

  if (options.px2rpx === true) {
    return postcssPxtrans(defaultPxTransformOptions)
  }

  const resolved = defuOverrideArray<PxTransformOptions, PxTransformOptions[]>(
    options.px2rpx,
    defaultPxTransformOptions,
  )
  const plugin = postcssPxtrans(resolved)
  if (!hasDynamicPxDesignWidth({ px2rpx: resolved })) {
    return plugin
  }

  return {
    postcssPlugin: plugin.postcssPlugin,
    prepare(result) {
      // 每个 LazyResult 持有自己的上游实例，保留本轮逐 Input 缓存和真实钩子。
      return postcssPxtrans(resolved).prepare?.(result) ?? {}
    },
  }
}
