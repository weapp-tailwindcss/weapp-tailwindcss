import type { PruneMiniProgramGeneratedCssOptions } from './prune-generated'
import postcss from 'postcss'
import postcssPresetEnv from 'postcss-preset-env'
import { applyConfiguredCssCalc } from '../../plugins/applyConfiguredCssCalc'
import { prepareMiniProgramFrameworkSelectors } from './framework-selectors'
import { pruneMiniProgramGeneratedCssRoot } from './prune-generated'

/**
 * 在同一 AST 中展开嵌套、准备框架选择器并裁剪，最后由 PostCSS 统一序列化。
 */
export async function normalizeMiniProgramGeneratedCssForPostcss(
  css: string,
  options: PruneMiniProgramGeneratedCssOptions = {},
) {
  const calculatedCss = await applyConfiguredCssCalc(css, {
    cssCalc: options.cssCalc,
    cssOptions: options.cssOptions,
    customPropertyValues: options.customPropertyValues,
    customPropertyContextCss: options.customPropertyContextCss,
    contextCss: options.contextCss ?? css,
  })
  const result = await postcss([
    postcssPresetEnv({
      stage: false,
      features: {
        'nesting-rules': true,
      },
      autoprefixer: false,
    }),
    {
      postcssPlugin: 'weapp-tailwindcss-mini-program-generated-css',
      // OnceExit 位于所有嵌套 visitor 之后、Result 首次序列化之前。
      OnceExit(root) {
        prepareMiniProgramFrameworkSelectors(root, options)
        pruneMiniProgramGeneratedCssRoot(root, options)
      },
    },
  ]).process(calculatedCss, { from: undefined })
  return result.css
}
