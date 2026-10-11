import type { AcceptedPlugin } from 'postcss'
import type { IStyleHandlerOptions } from '../types'
import { postcss } from '../postcss-runtime'
import { removeAdjacentDuplicateDeclarations } from './getCustomPropertyCleaner'
import { getPxTransformPlugin } from './getPxTransformPlugin'
import { getRemTransformPlugin } from './getRemTransformPlugin'
import { getUnitConversionPlugin } from './getUnitConversionPlugin'
import { getUnitsToPxPlugin } from './getUnitsToPxPlugin'

export type ApplyConfiguredCssUnitsOptions = Pick<
  IStyleHandlerOptions,
  'cssOptions' | 'platform' | 'rem2rpx' | 'px2rpx' | 'unitsToPx' | 'unitConversion' | 'postcssOptions'
>

/** 在跨资产 calc 求值之后按原管线顺序转换单位，不重复选择器和框架兼容变换。 */
export async function applyConfiguredCssUnits(css: string, options: ApplyConfiguredCssUnitsOptions = {}) {
  const resolved = {
    ...options,
    platform: options.cssOptions?.platform ?? options.platform,
    rem2rpx: options.cssOptions?.rem2rpx ?? options.rem2rpx,
    px2rpx: options.cssOptions?.px2rpx ?? options.px2rpx,
    unitsToPx: options.cssOptions?.unitsToPx ?? options.unitsToPx,
    unitConversion: options.cssOptions?.unitConversion ?? options.unitConversion,
  } as IStyleHandlerOptions
  const plugins = [
    getUnitsToPxPlugin(resolved),
    getPxTransformPlugin(resolved),
    getRemTransformPlugin(resolved),
    getUnitConversionPlugin(resolved),
  ].filter((plugin): plugin is AcceptedPlugin => plugin !== null)
  if (plugins.length === 0) {
    return css
  }
  const result = await postcss(plugins).process(css, { from: options.postcssOptions?.options?.from })
  return removeAdjacentDuplicateDeclarations(result.root) ? result.root.toString() : result.css
}
