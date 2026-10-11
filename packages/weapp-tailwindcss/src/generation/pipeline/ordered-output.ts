import type { GenerateCssByGeneratorResult } from '../types'
import type { GeneratorPipelineOutputContext } from './context'
import { filterExistingCssRules } from '@weapp-tailwindcss/postcss/transform'
import { hasTailwindApplyDirective } from '../directives'
import { createCssSourceOrderAppend, isEmptyCssSourceOrderParts, shouldAppendWebBundleCssFallback, shouldFinalizeMarkedUserLayerComponentsCss, splitRawSourceByGeneratedCssOrder } from '../generation-helpers'
import { appendLegacyCompatCss, appendLegacyContainerCompatCss } from '../legacy-compat'
import { inheritLegacyUnitConvertedDeclarations } from '../legacy-units'
import { restoreLocalCssImports } from '../local-imports'
import { splitGeneratorPlaceholderCssBySourceOrder, splitTailwindV4GeneratedCssBySourceOrder, stripTailwindBanner } from '../markers'
import { finalizeIncrementalGeneratorCss, finalizeWebGeneratorCss, isCssAlreadyRepresentedByMarkers, resolveGeneratedCssClassSet } from '../result-helpers'
import { hasUserCssLayerBlocks, isCommentOnlyCss, splitUserCssLayerBlocks, transformGeneratorUserCss } from '../user-css'
import { reorderMarkedUserLayerComponentsCss, wrapUserLayerComponentsCss } from '../user-layer-order'

export async function finalizeOrderedGeneratorCss(
  context: GeneratorPipelineOutputContext,
): Promise<GenerateCssByGeneratorResult | undefined> {
  const { configuredContainerCompat, cssHandlerOptions, cssUserHandlerOptions, file, filterGeneratedApplyOnlyCss, finalizeGeneratorCss, generated, generatedUserCssRawSource, generatorOptions, generatorRawSource, generatorStyleOptions, hasDistinctUserRawSource, hasGeneratedCss, hasGeneratedMarkers, hasMatchedCssSourceFile, hasSourceDirectives, hasWebUserCssFallbackSource, isolateCurrentCssCandidates, legacyCompatUserCssRawSource, localImports, majorVersion, options, opts, preflightMode, prepareFinalGeneratorCss, runtime, runtimeWithCurrentCss, shouldFilterApplyOnlyCss, shouldPreserveLegacyCompatSelectorOverrides, styleHandler, userCssOrderSource, userCssRawSource, userRawSourceProcessed } = context
  const canAppendIncrementalCss = generated.target !== 'weapp' || !hasUserCssLayerBlocks(generatorRawSource)
  if (canAppendIncrementalCss && typeof options.previousCss === 'string' && typeof generated.incrementalCss === 'string') {
    const incrementalCss = stripTailwindBanner(generated.incrementalCss)
    const css = incrementalCss.trim().length > 0
      ? finalizeIncrementalGeneratorCss(options.previousCss, incrementalCss, generated.target, majorVersion, opts.cssPreflight, {
          injectPreflight: false,
          removeEmptyAtRuleAncestors: false,
          styleOptions: generatorStyleOptions,
        }, generatorOptions.webCompat)
      : options.previousCss
    const finalCss = generated.target === 'web'
      ? restoreLocalCssImports(css, localImports, { outputFile: file })
      : finalizeWebGeneratorCss(restoreLocalCssImports(css, localImports, { outputFile: file }), generated.target, generatorOptions.webCompat)
    return {
      css: finalCss,
      classSet: resolveGeneratedCssClassSet(generated.target, generated.classSet, runtimeWithCurrentCss, finalCss, opts.escapeMap, options.previousClassSet),
      target: generated.target,
      source: 'generator',
      dependencies: [...generated.dependencies],
      incremental: true,
      metadata: {
        file,
        majorVersion,
        rawCss: generated.rawCss,
      },
    }
  }
  const generatedCssSource = generated.target === 'web'
    ? generated.css
    : stripTailwindBanner(generated.css)
  const generatedCss = filterGeneratedApplyOnlyCss(generatedCssSource)
  const placeholderOrderedExtraCss = splitGeneratorPlaceholderCssBySourceOrder(userCssOrderSource, generated.rawCss)
  const orderedExtraCss = placeholderOrderedExtraCss ?? (hasMatchedCssSourceFile
    ? splitTailwindV4GeneratedCssBySourceOrder(userCssOrderSource, generated.rawCss)
    : splitRawSourceByGeneratedCssOrder(userCssOrderSource, generated.rawCss))
  const shouldAppendMatchedCssSourceCompat = !hasMatchedCssSourceFile || orderedExtraCss !== undefined
  if (orderedExtraCss) {
    let css = generatedCss
    if (generated.target === 'weapp') {
      css = inheritLegacyUnitConvertedDeclarations(css, generatorRawSource)
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
    const afterLayerParts = generated.target === 'weapp'
      ? splitUserCssLayerBlocks(orderedExtraCss.after)
      : {
          layer: '',
          rest: orderedExtraCss.after,
        }
    const beforeUserCss = await transformGeneratorUserCss(orderedExtraCss.before, userCssOptions)
    const afterLayerUserCss = await transformGeneratorUserCss(afterLayerParts.layer, userCssOptions)
    const afterUserCss = await transformGeneratorUserCss(afterLayerParts.rest, userCssOptions)
    const fallbackLayerUserCss = generated.target === 'weapp'
      && hasUserCssLayerBlocks(userCssRawSource)
      ? filterExistingCssRules(
          afterLayerUserCss,
          await transformGeneratorUserCss(splitUserCssLayerBlocks(userCssRawSource).layer, userCssOptions),
        )
      : ''
    const orderedAfterLayerUserCss = generated.target === 'weapp'
      ? wrapUserLayerComponentsCss(createCssSourceOrderAppend(afterLayerUserCss, fallbackLayerUserCss))
      : afterLayerUserCss
    css = createCssSourceOrderAppend(
      createCssSourceOrderAppend(
        createCssSourceOrderAppend(beforeUserCss, orderedAfterLayerUserCss),
        css,
      ),
      afterUserCss,
    )
    if (
      hasWebUserCssFallbackSource
      && isEmptyCssSourceOrderParts(orderedExtraCss)
      && shouldAppendWebBundleCssFallback(generated.target, {
        hasSourceDirectives,
        hasMatchedCssSourceFile,
      })
    ) {
      const userCss = await transformGeneratorUserCss(userCssRawSource, userCssOptions)
      css = createCssSourceOrderAppend(css, userCss)
    }
    if (generated.target === 'web' && hasWebUserCssFallbackSource) {
      const userCss = await transformGeneratorUserCss(userCssRawSource, userCssOptions)
      const missingUserCss = isCommentOnlyCss(userCss) ? '' : filterExistingCssRules(css, userCss)
      css = createCssSourceOrderAppend(css, missingUserCss)
    }
    if (
      generated.target === 'weapp'
      && isEmptyCssSourceOrderParts(orderedExtraCss)
      && hasDistinctUserRawSource
      && !hasGeneratedCss
      && !hasGeneratedMarkers
      && !hasTailwindApplyDirective(generatedUserCssRawSource)
    ) {
      const userCss = await transformGeneratorUserCss(generatedUserCssRawSource, userCssOptions)
      const missingUserCss = isCssAlreadyRepresentedByMarkers(css, generatedUserCssRawSource)
        ? filterExistingCssRules(css, userCss)
        : userCss
      css = createCssSourceOrderAppend(css, missingUserCss)
    }
    if (generated.target === 'weapp' && shouldAppendMatchedCssSourceCompat) {
      if (shouldFinalizeMarkedUserLayerComponentsCss(file)) {
        css = reorderMarkedUserLayerComponentsCss(css)
      }
      if (
        !shouldFilterApplyOnlyCss
        && !userRawSourceProcessed
        && !hasGeneratedCss
        && !hasGeneratedMarkers
      ) {
        css = await appendLegacyCompatCss(
          css,
          legacyCompatUserCssRawSource,
          generated.target,
          styleHandler,
          cssHandlerOptions,
          generatorStyleOptions,
          { preserveSelectorOverrides: shouldPreserveLegacyCompatSelectorOverrides, generatedSource: generated.rawCss, compileAuthorCssFunctions: context.compileAuthorCssFunctions },
        )
        if (!isolateCurrentCssCandidates) {
          css = await appendLegacyContainerCompatCss(
            css,
            generatedUserCssRawSource,
            file,
            runtime,
            configuredContainerCompat,
            generated.target,
            styleHandler,
            cssHandlerOptions,
            generatorStyleOptions,
          )
        }
      }
    }
    else if (generated.target === 'weapp' && shouldFinalizeMarkedUserLayerComponentsCss(file)) {
      css = reorderMarkedUserLayerComponentsCss(css)
    }
    const finalCss = finalizeGeneratorCss(prepareFinalGeneratorCss(css), generated.target, {
      injectPreflight: preflightMode.inject,
      preservePreflight: preflightMode.preserve,
      styleOptions: generatorStyleOptions,
    })
    return {
      css: finalCss,
      classSet: resolveGeneratedCssClassSet(generated.target, generated.classSet, runtimeWithCurrentCss, finalCss, opts.escapeMap, options.previousClassSet),
      target: generated.target,
      source: 'generator',
      dependencies: [...generated.dependencies],
      metadata: {
        file,
        majorVersion,
        rawCss: generated.rawCss,
      },
    }
  }
  return undefined
}
