import type { IStyleHandlerOptions } from '../types'
import { postcss } from '../postcss-runtime'
import { getCalcPlugin } from './getCalcPlugin'

export type ApplyConfiguredCssCalcOptions = Pick<
  IStyleHandlerOptions,
  'cssCalc' | 'cssOptions' | 'customPropertyValues' | 'customPropertyContextCss'
  | 'cssCalcContextComplete' | 'cssCalcContextValues' | 'majorVersion' | 'platform' | 'uniAppX'
> & {
  /** 额外用于收集自定义属性的 CSS，例如生成器完整产物。 */
  contextCss?: string | undefined
}

function resolveCssCalcOption(options: ApplyConfiguredCssCalcOptions) {
  return options.cssOptions?.cssCalc ?? options.cssCalc
}

/**
 * 仅按 `cssCalc` 配置预计算 `calc()` / `var()`，不跑小程序选择器替换或单位转换。
 */
export async function applyConfiguredCssCalc(
  css: string,
  options: ApplyConfiguredCssCalcOptions = {},
) {
  const cssCalc = resolveCssCalcOption(options)
  if (!cssCalc || !css.includes('calc(')) {
    return css
  }

  const plugin = getCalcPlugin({
    majorVersion: options.majorVersion,
    platform: options.cssOptions?.platform ?? options.platform,
    uniAppX: options.uniAppX,
    cssCalcContextComplete: options.cssCalcContextComplete,
    cssCalcContextValues: options.cssCalcContextValues,
    cssCalc,
    customPropertyValues: options.customPropertyValues,
    customPropertyContextCss: [options.customPropertyContextCss ?? '', options.contextCss ?? ''].join('\n'),
  } as IStyleHandlerOptions)
  if (!plugin) {
    return css
  }

  try {
    const result = await postcss([plugin]).process(css, { from: undefined })
    return result.css
  }
  catch {
    return css
  }
}
