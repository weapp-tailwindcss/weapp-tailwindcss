import type { SetupWebpackV5ProcessAssetsHookOptions } from './helpers'
import type { createWebpackCssSourceTraceTokenSources, WebpackCssHandlerOptions } from './pipeline-helpers'
import { annotateCssSourceTrace } from '../../../shared/css-source-trace'
import { finalizeTracedWebpackCssAsset, finalizeWebpackCssAssetSource } from './pipeline-helpers'

/** 按本轮资产来源创建 CSS 收尾操作，统一追踪信息与转换目标。 */
export function createWebpackCssAssetFinalizers(
  compilerOptions: SetupWebpackV5ProcessAssetsHookOptions['options'],
  isWebGeneratorTarget: boolean,
  tokenSources: ReturnType<typeof createWebpackCssSourceTraceTokenSources>,
) {
  const annotateCss = (css: string) => annotateCssSourceTrace(css, {
    opts: compilerOptions,
    tokenSources,
  })
  return {
    finalizeCssAssetSource: (source: string, options: Parameters<typeof finalizeWebpackCssAssetSource>[3] = {}) =>
      finalizeWebpackCssAssetSource(source, compilerOptions, isWebGeneratorTarget, options),
    finalizeTracedCss: (css: string, cssHandlerOptions: WebpackCssHandlerOptions, options: { finalized?: boolean | undefined } = {}) =>
      finalizeTracedWebpackCssAsset(css, cssHandlerOptions, {
        annotateCss,
        compilerOptions,
        ...options,
        isWebGeneratorTarget,
      }),
  }
}
