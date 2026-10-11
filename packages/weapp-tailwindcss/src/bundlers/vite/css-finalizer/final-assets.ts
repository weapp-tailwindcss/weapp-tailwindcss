import type { OutputBundle } from 'rollup'
import type { CssFinalizerContext } from './options'
import { warnFinalRpxThemeRisk } from '@/tailwindcss/v4/rpx-theme-warning'
import { finalizeMiniProgramCssAssetStructures } from '../generate-bundle/final-css-assets'
import { finalizeCssCalc, finalizeWebCssCalc } from './css-calc'
import { inferPlatformFromViteOutDir } from './options'

/** 按生成目标统一收尾已组装的 CSS 资产，供空资产和常规分支复用。 */
export async function finalizeCssAssets(
  bundle: OutputBundle,
  context: CssFinalizerContext,
  isWebGeneratorTarget: boolean,
  files: ReadonlySet<string>,
) {
  if (isWebGeneratorTarget) {
    return finalizeWebCssCalc(bundle, context)
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
  warnFinalRpxThemeRisk(context.runtimeState, Object.entries(bundle).flatMap(([key, output]) => {
    const file = output.fileName || key
    return output.type === 'asset' && context.opts.cssMatcher(file) && !context.opts.htmlMatcher(file)
      ? [typeof output.source === 'string' ? output.source : new TextDecoder().decode(output.source)]
      : []
  }), context.opts, context.opts.cssOptions?.platform ?? context.opts.platform
  ?? inferPlatformFromViteOutDir(context.getResolvedConfig()?.build?.outDir))
}
