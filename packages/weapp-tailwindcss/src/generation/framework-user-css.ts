import type { GenerateCssByGeneratorOptions, GenerateCssByGeneratorResult } from './index'
import type { NormalizedWeappTailwindcssGeneratorOptions } from '@/generator'
import { normalizeFrameworkProcessedUserCss } from '@weapp-tailwindcss/postcss/transform'
import { composeFrameworkProcessedCss } from './framework-css-composition'
import { createCssSourceOrderAppend, finalizeMiniProgramGeneratorCss, resolveGeneratorStyleOptions, splitRawSourceByGeneratedCssOrder } from './generation-helpers'
import { stripTailwindBanners } from './markers'
import { removeTailwindV4GeneratedUserCssArtifacts, splitUserCssLayerBlocks, transformGeneratorUserCss } from './user-css'
import { createGeneratedThemeDeclarationResolver } from './user-css/generated-cleanup'
import { reorderMarkedUserLayerComponentsCss, wrapUserLayerComponentsCss } from './user-layer-order'

export { normalizeFrameworkProcessedUserCss }

export async function restoreFrameworkProcessedUserCss(
  css: string,
  generated: GenerateCssByGeneratorResult,
  source: string,
  options: GenerateCssByGeneratorOptions,
  generatorOptions: NormalizedWeappTailwindcssGeneratorOptions,
) {
  const generatedSource = createGeneratedThemeDeclarationResolver([generated.metadata?.rawCss, css].filter(Boolean).join('\n'))
  const userCssOptions = {
    compileAuthorCssFunctions: generated.compileAuthorCssFunctions,
    generatorTarget: generated.target,
    generatedSource,
    generatorStyleOptions: resolveGeneratorStyleOptions(options.opts, options.cssHandlerOptions, generatorOptions.styleOptions),
    cssUserHandlerOptions: options.cssUserHandlerOptions,
    styleHandler: options.styleHandler,
    importFallback: generatorOptions.importFallback,
  }
  const transform = async (value: string) => {
    const parts = splitUserCssLayerBlocks(value)
    const layer = await transformGeneratorUserCss(parts.layer, userCssOptions)
    const rest = await transformGeneratorUserCss(parts.rest, userCssOptions)
    return removeTailwindV4GeneratedUserCssArtifacts(finalizeMiniProgramGeneratorCss(
      createCssSourceOrderAppend(wrapUserLayerComponentsCss(layer), rest),
      generated.target,
      options.runtimeState.tailwindRuntime.majorVersion,
      options.opts.cssPreflight,
      { injectPreflight: false, preservePreflight: generated.metadata?.preflightMode?.preserve, styleOptions: options.cssHandlerOptions },
    ), generatedSource)
  }
  const userSource = normalizeFrameworkProcessedUserCss(source)
  const ordered = splitRawSourceByGeneratedCssOrder(userSource, generated.metadata?.rawCss ?? '')
    ?? { before: '', after: userSource }
  // 已经过框架转换的 CSS 不再重放框架插件；双方完成小程序适配后再比较和合并。
  const before = await transform(ordered.before)
  const after = await transform(ordered.after)
  return stripTailwindBanners(reorderMarkedUserLayerComponentsCss(composeFrameworkProcessedCss(before, css, after)))
}
