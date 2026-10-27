import type { GenerateCssByGeneratorResult } from '../types'
import type { GeneratorPipelineOutputContext } from './context'
import { filterExistingCssRules, normalizeMiniProgramGeneratedCssForPostcss } from '@weapp-tailwindcss/postcss/transform'
import { hasCssMacroStyleOptions, hasCssMacroTailwindV4InternalAtRules, transformCssMacroCss } from '@/css-macro/auto'
import { createCssSourceOrderAppend, splitRawSourceByGeneratedCssOrder } from '../generation-helpers'
import { restoreLocalCssImports } from '../local-imports'
import { createCssAppend, splitGeneratorPlaceholderCssBySourceOrder, splitTailwindV4GeneratedCssBySourceOrder, stripTailwindBanner } from '../markers'
import { canAppendGeneratorCss, resolveGeneratedCssClassSet } from '../result-helpers'
import { hasUserCssLayerBlocks, splitUserCssLayerBlocks, transformGeneratorUserCss } from '../user-css'
import { reorderMarkedUserLayerComponentsCss, wrapUserLayerComponentsCss } from '../user-layer-order'

export async function finalizeDeferredGeneratorCss(
  context: GeneratorPipelineOutputContext,
): Promise<GenerateCssByGeneratorResult | undefined> {
  const { cssUserHandlerOptions, file, filterGeneratedApplyOnlyCss, generated, generatedUserCssRawSource, generatorOptions, generatorRawSource, generatorStyleOptions, hasMatchedCssSourceFile, localImports, majorVersion, options, profile, preflightMode, runtimeWithCurrentCss, styleHandler, userCssOrderSource, userRawSourceProcessed } = context
  if (options.deferCssAdaptation) {
    const normalizeDeferredGeneratedCss = async (css: string) => {
      const rawCss = stripTailwindBanner(css)
      const generationCss = generated.target === 'weapp'
        && (hasCssMacroStyleOptions(generatorStyleOptions) || hasCssMacroTailwindV4InternalAtRules(rawCss))
        ? await transformCssMacroCss(rawCss, generatorStyleOptions)
        : rawCss
      const normalizedCss = generated.target === 'weapp'
        ? await normalizeMiniProgramGeneratedCssForPostcss(generationCss, {
            cssCalc: generatorStyleOptions.cssCalc,
            cssSelectorReplacement: generatorStyleOptions.cssSelectorReplacement,
            cssOptions: generatorStyleOptions.cssOptions,
            customPropertyValues: generatorStyleOptions.customPropertyValues,
            contextCss: generated.customPropertyContextCss ?? generated.rawCss,
            preservePreflight: true,
            preserveRawClassRules: true,
          })
        : generationCss
      return filterGeneratedApplyOnlyCss(normalizedCss)
    }
    const restoreDeferredUserCss = async (css: string) => {
      if (generated.target !== 'weapp' || generatedUserCssRawSource.trim().length === 0) {
        return css
      }

      const userCssOptions = {
        generatorTarget: generated.target,
        compileAuthorCssFunctions: context.compileAuthorCssFunctions,
        generatedSource: generated.rawCss,
        generatorStyleOptions,
        cssUserHandlerOptions,
        styleHandler,
        importFallback: generatorOptions.importFallback,
        processed: userRawSourceProcessed,
      }
      const transformDeferredUserCss = async (source: string) => {
        const parts = splitUserCssLayerBlocks(source)
        const layerCss = await transformGeneratorUserCss(parts.layer, userCssOptions)
        const restCss = await transformGeneratorUserCss(parts.rest, userCssOptions)
        return createCssSourceOrderAppend(wrapUserLayerComponentsCss(layerCss), restCss)
      }
      const orderedUserCss = splitGeneratorPlaceholderCssBySourceOrder(userCssOrderSource, generated.rawCss)
        ?? (hasMatchedCssSourceFile
          ? splitTailwindV4GeneratedCssBySourceOrder(userCssOrderSource, generated.rawCss)
          : splitRawSourceByGeneratedCssOrder(userCssOrderSource, generated.rawCss))

      if (orderedUserCss) {
        const beforeUserCss = await transformDeferredUserCss(orderedUserCss.before)
        const afterUserCss = await transformDeferredUserCss(orderedUserCss.after)
        const missingBeforeUserCss = filterExistingCssRules(css, beforeUserCss)
        const cssWithBeforeUserCss = createCssSourceOrderAppend(missingBeforeUserCss, css)
        const missingAfterUserCss = filterExistingCssRules(cssWithBeforeUserCss, afterUserCss)
        return reorderMarkedUserLayerComponentsCss(
          createCssSourceOrderAppend(cssWithBeforeUserCss, missingAfterUserCss),
        )
      }

      const userCss = await transformDeferredUserCss(generatedUserCssRawSource)
      return reorderMarkedUserLayerComponentsCss(
        createCssSourceOrderAppend(css, filterExistingCssRules(css, userCss)),
      )
    }
    const canAppendIncrementalCss = canAppendGeneratorCss(generated.target, generatorOptions.webCompat)
      && (generated.target !== 'weapp' || !hasUserCssLayerBlocks(generatorRawSource))
    const incrementalRawCss = generated.incrementalRawCss ?? generated.incrementalCss
    const previousCss = options.previousCss
    const shouldAppendIncrementalCss = canAppendIncrementalCss
      && typeof previousCss === 'string'
      && typeof incrementalRawCss === 'string'
    const normalizedCss = shouldAppendIncrementalCss
      ? incrementalRawCss.trim().length > 0
        ? createCssAppend(previousCss, await normalizeDeferredGeneratedCss(incrementalRawCss))
        : previousCss
      : await normalizeDeferredGeneratedCss(generated.rawCss ?? generated.css)
    const intermediateCss = shouldAppendIncrementalCss
      ? normalizedCss
      : await restoreDeferredUserCss(normalizedCss)
    const css = restoreLocalCssImports(
      intermediateCss,
      localImports,
      { outputFile: file },
    )
    return {
      css,
      classSet: resolveGeneratedCssClassSet(
        generated.target,
        generated.classSet,
        runtimeWithCurrentCss,
        css,
        profile.escapeMap,
        options.previousClassSet,
      ),
      target: generated.target,
      source: 'generator',
      dependencies: [...generated.dependencies],
      incremental: shouldAppendIncrementalCss,
      metadata: {
        file,
        majorVersion,
        preflightMode,
        rawCss: generated.rawCss,
      },
    }
  }
  return undefined
}
