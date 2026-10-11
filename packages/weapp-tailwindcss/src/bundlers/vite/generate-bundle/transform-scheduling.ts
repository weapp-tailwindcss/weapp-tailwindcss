import { recordViteCssContribution } from './css-transform-result'

export function scheduleViteCssTransform(options: any) {
  const {
    addWatchFile,
    annotateCss,
    applyCssResult,
    applyViteCssCacheResult,
    applyViteCssTransformTaskResult,
    assetSourceFile,
    cache,
    cssCacheKey,
    cssHandlerOptions,
    cssHashKey,
    cssRuntimeAffectingHash,
    cssSharedCacheKey,
    cssTaskFactories,
    cssTaskHash,
    debug,
    envFlags,
    executeViteCssTransformTask,
    file,
    generatorCandidatesChanged,
    generatorCssHandlerOptions,
    generatorCssUserHandlerOptions,
    generatorPlatform,
    generatorRawSource,
    generatorSourceFile,
    generatorUserLayerRawSource,
    getLastCssResult,
    hasRuntimeAffectingChanges,
    isWebGeneratorTarget,
    lastCssResultByFile,
    lastCssSourceHashByFile,
    markCssAssetProcessed,
    measureElapsed,
    metrics,
    normalizeGeneratorUserRawSource,
    normalizeMiniProgramGeneratorRawSource,
    onUpdate,
    opts,
    originalSource,
    outputCssHandlerOptions,
    outputFile,
    processViteCssCacheTask,
    rawSource,
    recordCssAssetResult,
    recordViteProcessedCssAssetResult,
    rememberedCssRuntimeSignature,
    rememberedCssSources,
    rememberCssSource,
    removeRootCoveredCssFromScopedAsset,
    runtimeState,
    scopedGeneratorRuntime,
    scopedSourceCandidateGetter,
    sharedCssResultCache,
    shouldInjectVitePipelineCssIntoMain,
    shouldRecordVitePipelineCssByOutput,
    snapshot,
    styleHandler,
    timeTask,
    transformRuntime,
    transformWebTargetCss,
    useIncrementalMode,
    usesConfiguredTailwindV4FallbackSource,
    vitePipelineCssAsset,
    vitePipelineCssInjectionOutputFile,
  } = options

  const runTransform = async () => {
    const start = performance.now()
    const previousCss = !vitePipelineCssAsset
      && useIncrementalMode
      && !generatorCandidatesChanged
      && !hasRuntimeAffectingChanges
      && !snapshot.changedByType.css.has(file)
      ? getLastCssResult(lastCssResultByFile, outputFile, file)
      : undefined
    const transformResult = await executeViteCssTransformTask({
      annotateCss,
      assetSourceFile,
      cssUserHandlerOptions: generatorCssUserHandlerOptions,
      debug,
      generatorCssHandlerOptions,
      generatorPlatform,
      generatorRawSource,
      generatorSourceFile,
      generatorUserLayerRawSource,
      getSourceCandidatesForEntries: scopedSourceCandidateGetter,
      isWebGeneratorTarget,
      normalizeGeneratorUserRawSource,
      normalizeMiniProgramGeneratorRawSource,
      opts,
      outputFile,
      previousCss,
      rawSource,
      removeRootCoveredCssFromScopedAsset,
      runtime: scopedGeneratorRuntime,
      runtimeState,
      styleHandler,
      styleHandlerOptions: cssHandlerOptions,
      transformWebTargetCss,
      usesConfiguredTailwindV4FallbackSource,
      vitePipelineCssAsset,
    })
    const css = applyViteCssTransformTaskResult({
      addWatchFile,
      debug,
      debugCssDiff: envFlags.debugCssDiff,
      file,
      generatorSourceFile,
      outputFile,
      outputIsMainChunk: outputCssHandlerOptions.isMainChunk === true,
      recordCssAssetResult,
      recordViteProcessedCssAssetResult,
      result: transformResult,
      shouldInjectVitePipelineCssIntoMain,
      shouldRecordVitePipelineCssByOutput,
      tailwindcssMajorVersion: runtimeState.tailwindRuntime.majorVersion,
      transformRuntime,
      vitePipelineCssAsset,
      vitePipelineCssInjectionOutputFile,
    })
    metrics.css.elapsed += measureElapsed(start)
    metrics.css.transformed++
    return css
  }

  cssTaskFactories.push(() => timeTask('css', () => processViteCssCacheTask({
    applyResult(source: string) {
      applyViteCssCacheResult({
        applyCssResult,
        recordCssResult: vitePipelineCssAsset
          ? (css: string) => {
              recordCssAssetResult?.(outputFile, css)
              recordViteCssContribution({
                file,
                outputIsMainChunk: outputCssHandlerOptions.isMainChunk === true,
                recordViteProcessedCssAssetResult,
                shouldRecordVitePipelineCssByOutput,
                shouldInjectVitePipelineCssIntoMain,
                vitePipelineCssAsset,
                vitePipelineCssInjectionOutputFile,
              }, css)
            }
          : undefined,
        cssRuntimeAffectingHash,
        generatorRawSource,
        generatorSourceFile,
        lastCssResultByFile,
        lastCssSourceHashByFile,
        markCssAssetProcessed,
        originalSource,
        outputFile,
        rememberedCssRuntimeSignature,
        rememberedSourcesCount: rememberedCssSources.length,
        rememberCssSource,
        vitePipelineCssInjectionOutputFile,
      }, source)
    },
    cache,
    cacheKey: cssCacheKey,
    hashKey: cssHashKey,
    onCacheHit() {
      metrics.css.cacheHits++
      debug('css cache hit: %s', file)
    },
    onSharedCacheHit() {
      metrics.css.cacheHits++
      debug('css shared hit: %s', file)
    },
    onSharedResult(sharedCss: string) {
      onUpdate(file, rawSource, sharedCss)
    },
    onTransformResult(css: string) {
      onUpdate(outputFile, rawSource, css)
      debug('css handle: %s', outputFile)
    },
    sharedCacheKey: cssSharedCacheKey,
    sharedResultCache: sharedCssResultCache,
    taskHash: cssTaskHash,
    transform: runTransform,
  })))
}
