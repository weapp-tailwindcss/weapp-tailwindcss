import { createRequire } from 'node:module'
import CssMinimizerPlugin from 'css-minimizer-webpack-plugin'

const require = createRequire(import.meta.url)

export function createWebsiteCssMinimizer() {
  return new CssMinimizerPlugin<[CssMinimizerPlugin.CssNanoOptionsExtended, CssMinimizerPlugin.CustomOptions]>({
    minimizerOptions: [
      { preset: require.resolve('@docusaurus/cssnano-preset') },
      {
        inline: false,
        level: {
          1: { all: false, removeWhitespace: true },
          // clean-css 无法证明自定义属性与 :where() 选择器之间的重排安全性。
          // 保留其余压缩，仅禁止跨规则移动条件块。
          2: { all: true, restructureRules: true, removeUnusedAtRules: false, mergeMedia: false },
        },
      },
    ],
    minify: [CssMinimizerPlugin.cssnanoMinify, CssMinimizerPlugin.cleanCssMinify],
  })
}

export function preserveWebsiteCssConditionalOrder<T>(minimizers: readonly T[]): T[] {
  let replacements = 0
  const result = minimizers.map((minimizer) => {
    if (minimizer?.constructor.name !== 'CssMinimizerPlugin') {
      return minimizer
    }
    replacements++
    // Docusaurus 和站点可能解析到不同的 webpack 5 类型实例，保留调用方插件类型。
    return createWebsiteCssMinimizer() as unknown as T
  })
  if (replacements !== 1) {
    throw new Error(`站点必须包含一个可识别的 CSS 压缩器，实际为 ${replacements}`)
  }
  return result
}
