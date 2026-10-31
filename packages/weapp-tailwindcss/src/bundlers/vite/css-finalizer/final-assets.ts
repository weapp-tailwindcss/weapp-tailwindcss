import type { OutputBundle } from 'rollup'
import type { CssFinalizerContext } from './options'
import { assertSkylineTypographyAsset } from '@/context/skyline-typography'
import { warnFinalRpxThemeRisk } from '@/tailwindcss/v4/rpx-theme-warning'
import { finalizeMiniProgramCssAssetStructures } from '../generate-bundle/final-css-assets'
import { finalizeCssCalc } from './css-calc'
import { inferPlatformFromViteOutDir } from './options'
import { finalizeWebCssAssets } from './web-assets'

/** 按生成目标统一收尾已组装的 CSS 资产，供空资产和常规分支复用。 */
export async function finalizeCssAssets(
  bundle: OutputBundle,
  context: CssFinalizerContext,
  isWebGeneratorTarget: boolean,
  files: ReadonlySet<string>,
) {
  if (isWebGeneratorTarget) {
    return finalizeWebCssAssets(bundle, context)
  }
  finalizeMiniProgramCssAssetStructures(bundle, {
    cssMatcher: context.opts.cssMatcher,
    debug: context.debug,
    files,
    isWebGeneratorTarget,
    onUpdate: context.opts.onUpdate,
    recordCssAssetResult: context.recordCssAssetResult,
  })
  await finalizeCssCalc(bundle, context, true)
  assertSkylineTypographyBundle(bundle, context)
  warnFinalRpxThemeRisk(context.runtimeState, Object.entries(bundle).flatMap(([key, output]) => {
    const file = output.fileName || key
    return output.type === 'asset' && context.opts.cssMatcher(file) && !context.opts.htmlMatcher(file)
      ? [typeof output.source === 'string' ? output.source : new TextDecoder().decode(output.source)]
      : []
  }), context.opts, context.opts.cssOptions?.platform ?? context.opts.platform
  ?? inferPlatformFromViteOutDir(context.getResolvedConfig()?.build?.outDir))
}

/** 在资产清理前和最终写出前均校验，防止跨资产注册被中间步骤删除后漏检。 */
export function assertSkylineTypographyBundle(bundle: OutputBundle, context: CssFinalizerContext) {
  for (const [key, output] of Object.entries(bundle)) {
    const file = output.fileName || key
    if (output.type === 'asset' && context.opts.cssMatcher(file) && !context.opts.htmlMatcher(file)) {
      assertSkylineTypographyAsset(typeof output.source === 'string' ? output.source : new TextDecoder().decode(output.source), context.opts, context.runtimeState.tailwindRuntime.majorVersion, inferPlatformFromViteOutDir(context.getResolvedConfig()?.build?.outDir))
    }
  }
}
