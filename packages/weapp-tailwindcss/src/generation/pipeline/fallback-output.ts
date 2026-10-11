import type { GenerateCssByGeneratorResult } from '../types'
import type { GeneratorPipelineOutputContext } from './context'
import { filterExistingCssRules } from '@weapp-tailwindcss/postcss/transform'
import { hasTailwindApplyDirective } from '../directives'
import { createCssSourceOrderAppend, shouldAppendWebBundleCssFallback, shouldFinalizeMarkedUserLayerComponentsCss } from '../generation-helpers'
import { appendLegacyCompatCss, appendLegacyContainerCompatCss } from '../legacy-compat'
import { inheritLegacyUnitConvertedDeclarations } from '../legacy-units'
import { isCssAlreadyRepresentedByMarkers, resolveGeneratedCssClassSet } from '../result-helpers'
import { extractGeneratedCssForUserLayerSelectors, hasUserCssLayerBlocks, isCommentOnlyCss, removeTailwindV4GeneratedUserCssArtifacts, splitUserCssLayerBlocks, transformGeneratorUserCss } from '../user-css'
import { reorderMarkedUserLayerComponentsCss, wrapUserLayerComponentsCss } from '../user-layer-order'

export async function finalizeFallbackGeneratorCss(
  context: GeneratorPipelineOutputContext,
): Promise<GenerateCssByGeneratorResult> {
  const { configuredContainerCompat, cssHandlerOptions, cssUserHandlerOptions, debug, file, finalizeGeneratorCss, generated, generatedCss, generatedUserCssRawSource, generatorOptions, generatorRawSource, generatorStyleOptions, hasDistinctUserRawSource, hasGeneratedCss, hasGeneratedMarkers, hasMatchedCssSourceFile, hasSourceDirectives, hasWebUserCssFallbackSource, isolateCurrentCssCandidates, legacyCompatUserCssRawSource, majorVersion, options, opts, preflightMode, prepareFinalGeneratorCss, runtime, runtimeWithCurrentCss, shouldFilterApplyOnlyCss, shouldPreserveLegacyCompatSelectorOverrides, styleHandler, userCssRawSource, userRawSourceProcessed } = context
  debug(
    'tailwind direct css generation prefix mismatch, append transformed bundle css %s',
    file,
  )
  let css = generatedCss
  const distinctUserLayerParts = hasDistinctUserRawSource
    && hasUserCssLayerBlocks(generatedUserCssRawSource)
    ? splitUserCssLayerBlocks(generatedUserCssRawSource)
    : undefined
  let restoredDistinctUserLayerCss = false
  if (
    generated.target === 'weapp'
    && generatorRawSource.includes('weapp-tailwindcss generator-placeholder')
    && !hasUserCssLayerBlocks(generatorRawSource)
  ) {
    const userCss = await transformGeneratorUserCss(generatedUserCssRawSource, {
      generatorTarget: generated.target,
      compileAuthorCssFunctions: context.compileAuthorCssFunctions,
      generatedSource: generated.rawCss,
      generatorStyleOptions,
      cssUserHandlerOptions,
      styleHandler,
      importFallback: generatorOptions.importFallback,
      processed: userRawSourceProcessed,
    })
    css = createCssSourceOrderAppend(userCss, css)
  }
  if (generated.target === 'weapp') {
    css = inheritLegacyUnitConvertedDeclarations(css, generatorRawSource)
    if (hasUserCssLayerBlocks(generatorRawSource)) {
      const layerParts = splitUserCssLayerBlocks(generatorRawSource)
      const layerUserCss = await transformGeneratorUserCss(layerParts.layer, {
        generatorTarget: generated.target,
        compileAuthorCssFunctions: context.compileAuthorCssFunctions,
        generatedSource: generated.rawCss,
        generatorStyleOptions,
        cssUserHandlerOptions,
        styleHandler,
        importFallback: generatorOptions.importFallback,
        processed: userRawSourceProcessed,
      })
      const layerCss = layerUserCss.trim().length > 0 && !hasTailwindApplyDirective(layerUserCss)
        ? {
            layer: layerUserCss,
            rest: css,
          }
        : extractGeneratedCssForUserLayerSelectors(css, layerParts.layer)
      if (layerCss.layer.trim().length > 0) {
        css = createCssSourceOrderAppend(wrapUserLayerComponentsCss(layerCss.layer), layerCss.rest)
        if (shouldFinalizeMarkedUserLayerComponentsCss(file)) {
          css = reorderMarkedUserLayerComponentsCss(css)
        }
      }
    }
    if (
      hasDistinctUserRawSource
      && distinctUserLayerParts
    ) {
      const layerUserCss = await transformGeneratorUserCss(
        distinctUserLayerParts.layer,
        {
          generatorTarget: generated.target,
          compileAuthorCssFunctions: context.compileAuthorCssFunctions,
          generatedSource: generated.rawCss,
          generatorStyleOptions,
          cssUserHandlerOptions,
          styleHandler,
          importFallback: generatorOptions.importFallback,
          processed: userRawSourceProcessed,
        },
      )
      const missingLayerUserCss = filterExistingCssRules(css, layerUserCss)
      if (missingLayerUserCss.trim().length > 0) {
        css = createCssSourceOrderAppend(wrapUserLayerComponentsCss(layerUserCss), css)
        restoredDistinctUserLayerCss = true
        if (shouldFinalizeMarkedUserLayerComponentsCss(file)) {
          css = reorderMarkedUserLayerComponentsCss(css)
        }
      }
    }
  }
  if (hasMatchedCssSourceFile || generated.target === 'web') {
    if (
      generated.target === 'weapp'
      && !hasGeneratedCss
      && !hasGeneratedMarkers
    ) {
      const distinctUserCssRawSource = restoredDistinctUserLayerCss
        ? distinctUserLayerParts?.rest ?? generatedUserCssRawSource
        : generatedUserCssRawSource
      const userCss = await transformGeneratorUserCss(distinctUserCssRawSource, {
        generatorTarget: generated.target,
        compileAuthorCssFunctions: context.compileAuthorCssFunctions,
        generatedSource: generated.rawCss,
        generatorStyleOptions,
        cssUserHandlerOptions,
        styleHandler,
        importFallback: generatorOptions.importFallback,
        processed: userRawSourceProcessed,
      })
      const missingUserCss = isCssAlreadyRepresentedByMarkers(css, distinctUserCssRawSource)
        ? filterExistingCssRules(css, userCss)
        : userCss
      css = createCssSourceOrderAppend(css, missingUserCss)
    }
    else if (
      hasMatchedCssSourceFile
      && generated.target === 'weapp'
      && hasGeneratedMarkers
      && !hasGeneratedCss
    ) {
      const cleanedUserCssRawSource = removeTailwindV4GeneratedUserCssArtifacts(userCssRawSource, generated.rawCss)
      const cleanedUserCssRestSource = restoredDistinctUserLayerCss && hasUserCssLayerBlocks(cleanedUserCssRawSource)
        ? splitUserCssLayerBlocks(cleanedUserCssRawSource).rest
        : cleanedUserCssRawSource
      const userCss = await transformGeneratorUserCss(cleanedUserCssRestSource, {
        generatorTarget: generated.target,
        compileAuthorCssFunctions: context.compileAuthorCssFunctions,
        generatedSource: generated.rawCss,
        generatorStyleOptions,
        cssUserHandlerOptions,
        styleHandler,
        importFallback: generatorOptions.importFallback,
        processed: userRawSourceProcessed,
      })
      const missingUserCss = filterExistingCssRules(css, userCss)
      css = createCssSourceOrderAppend(css, missingUserCss)
    }
    else if (hasMatchedCssSourceFile && generated.target === 'weapp' && hasUserCssLayerBlocks(generatedUserCssRawSource)) {
      const layerUserCss = await transformGeneratorUserCss(splitUserCssLayerBlocks(generatedUserCssRawSource).layer, {
        generatorTarget: generated.target,
        compileAuthorCssFunctions: context.compileAuthorCssFunctions,
        generatedSource: generated.rawCss,
        generatorStyleOptions,
        cssUserHandlerOptions,
        styleHandler,
        importFallback: generatorOptions.importFallback,
        processed: userRawSourceProcessed,
      })
      if (layerUserCss.trim().length > 0) {
        css = createCssSourceOrderAppend(css, wrapUserLayerComponentsCss(layerUserCss))
        if (shouldFinalizeMarkedUserLayerComponentsCss(file)) {
          css = reorderMarkedUserLayerComponentsCss(css)
        }
      }
    }
    if (hasMatchedCssSourceFile && generated.target === 'weapp') {
      if (
        !isolateCurrentCssCandidates
        && !shouldFilterApplyOnlyCss
        && !userRawSourceProcessed
        && !hasGeneratedCss
        && !hasGeneratedMarkers
      ) {
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
    if (
      hasWebUserCssFallbackSource
      && shouldAppendWebBundleCssFallback(generated.target, {
        hasSourceDirectives,
        hasMatchedCssSourceFile,
      })
    ) {
      const userCss = await transformGeneratorUserCss(generatedUserCssRawSource, {
        generatorTarget: generated.target,
        compileAuthorCssFunctions: context.compileAuthorCssFunctions,
        generatedSource: generated.rawCss,
        generatorStyleOptions,
        cssUserHandlerOptions,
        styleHandler,
        importFallback: generatorOptions.importFallback,
        processed: userRawSourceProcessed,
      })
      const missingUserCss = isCommentOnlyCss(userCss) ? '' : filterExistingCssRules(css, userCss)
      css = createCssSourceOrderAppend(css, missingUserCss)
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
  if (
    generated.target === 'weapp'
    && hasDistinctUserRawSource
    && !hasGeneratedCss
    && !hasGeneratedMarkers
    && !hasTailwindApplyDirective(generatedUserCssRawSource)
  ) {
    const distinctUserCssRawSource = restoredDistinctUserLayerCss
      ? distinctUserLayerParts?.rest ?? generatedUserCssRawSource
      : generatedUserCssRawSource
    const userCss = await transformGeneratorUserCss(distinctUserCssRawSource, {
      generatorTarget: generated.target,
      compileAuthorCssFunctions: context.compileAuthorCssFunctions,
      generatedSource: generated.rawCss,
      generatorStyleOptions,
      cssUserHandlerOptions,
      styleHandler,
      importFallback: generatorOptions.importFallback,
      processed: userRawSourceProcessed,
    })
    const missingUserCss = isCssAlreadyRepresentedByMarkers(css, distinctUserCssRawSource)
      ? filterExistingCssRules(css, userCss)
      : userCss
    css = createCssSourceOrderAppend(css, missingUserCss)
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
