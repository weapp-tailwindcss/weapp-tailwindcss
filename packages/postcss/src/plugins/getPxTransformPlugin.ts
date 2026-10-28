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

export function getPxTransformPlugin(options: IStyleHandlerOptions): AcceptedPlugin | null {
  if (!options.px2rpx) {
    return null
  }

  if (options.px2rpx === true) {
    return postcssPxtrans(defaultPxTransformOptions)
  }

  return postcssPxtrans(
    defuOverrideArray<PxTransformOptions, PxTransformOptions[]>(
      options.px2rpx,
      defaultPxTransformOptions,
    ),
  )
}
