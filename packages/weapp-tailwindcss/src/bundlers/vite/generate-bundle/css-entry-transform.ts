import { isSkylineTypographyEnabledForContext } from '@/context/skyline-typography'
import { captureViteCssSources } from '../css-memory/source-lifecycle'
import { createScopedGeneratorCandidateSignatureForSources, createScopedGeneratorSourceData } from './scoped-generator-sources'
import { scheduleViteCssTransform } from './transform-scheduling'

/** 消费已确定的来源与输出计划，依次复用、回放或调度 CSS 转换。 */
export async function processViteCssEntryTransform(options: any) {
  const isSourceCurrent = captureViteCssSources(options.captureCssSource, [
    options.cssCompositionPlan.generatorSourceFile,
    options.assetSourceFile,
    ...options.rememberedCssSources.map((source: { sourceFile: string }) => source.sourceFile),
  ].filter((file): file is string => typeof file === 'string'))
  let scheduled = false
  try {
    scheduled = await processViteCssEntryTransformNow({ ...options, isSourceCurrent }) === true
  }
  finally {
    if (!scheduled) {
      isSourceCurrent.release()
    }
  }
}

async function processViteCssEntryTransformNow(options: any) {
  if (!options.isSourceCurrent()) {
    return
  }
  const {
    addWatchFile,
    alreadyProcessedCssAsset,
    annotateCssSourceTrace,
    applyCssResult,
    applyViteCssCacheResult,
    applyViteCssTransformTaskResult,
    assetSourceFile,
    bundle,
    cache,
    collectedBundlerGeneratedCssFiles,
    createCandidateSignature,
    createCssSourceTraceCacheSignature,
    createCssTokenSourceMap,
    createCssTransformShareScopeKey,
    createRuntimeAffectingSourceSignature,
    createScopedGeneratorCandidateSignature,
    createScopedGeneratorRuntime,
    createScopedGeneratorSourceTraceMap,
    createScopedSourceCandidateGetter,
    createScopedSourceCandidateSourceGetter,
    cssAssetIdentity,
    cssCompositionPlan,
    cssTaskFactories,
    currentSubpackageRoots,
    debug,
    envFlags,
    executeViteCssTransformTask,
    file,
    generatorCandidatesChanged,
    generatorPlatform,
    generatorRuntime,
    getCssUserHandlerOptions,
    getLastCssResult,
    hasRuntimeAffectingChanges,
    isSubpackageOutputFile,
    isWebGeneratorTarget,
    lastCssResultByFile,
    lastCssSourceHashByFile,
    markCssAssetProcessed,
    measureElapsed,
    metrics,
    normalizeGeneratorUserRawSource,
    normalizeMiniProgramGeneratorRawSource,
    normalizeOutputPathKey,
    onUpdate,
    opts,
    originalSource,
    outputCssHandlerOptions,
    outputFile,
    processFiles,
    processViteCssCacheTask,
    rawSource,
    recordCssAssetResult,
    recordViteProcessedCssAssetResult,
    rememberCssSource,
    rememberProcessCacheKey,
    rememberedCssSource,
    rememberedCssSources,
    removeCssCoveredByRootStyleBundleSources,
    resolveViteCssTransformCachePlan,
    resolveViteCssTransformDecisionPlan,
    resolvedFromConfiguredOriginalCssEntry,
    runtimeLinkedCssFiles,
    runtimeSignature,
    runtimeState,
    sharedCssResultCache,
    shouldExcludeSubpackageSourceCandidates,
    shouldInjectCssIntoMainFromOutput,
    shouldProcessTailwindGeneration,
    snapshot,
    state,
    styleHandler,
    timeTask,
    transformRuntime,
    transformWebTargetCss,
    useIncrementalMode,
    viteProcessedCssAsset,
  } = options
  const { cssHandlerOptions: cssHandlerOptions2, generatorCssHandlerOptions, generatorRawSource, generatorSourceFile, generatorSourceKind, generatorUserLayerRawSource, hasCurrentTailwindGenerationDirective, hasRememberedApplySource, hasSameOutputRememberedTailwindGenerationSource, hasStaleViteProcessedCssSource, usesConfiguredTailwindV4FallbackSource, vitePipelineCssAsset, webviewRootCssInjectionTarget } = cssCompositionPlan
  const removeRootCoveredCssFromScopedAsset = (css: string) => {
    const normalizedOutputFile = normalizeOutputPathKey(outputFile.replace(/[?#].*$/, ''))
    const isRootOrSubpackageCss = !normalizedOutputFile.includes('/')
      || (
        currentSubpackageRoots != null
        && isSubpackageOutputFile(normalizedOutputFile, currentSubpackageRoots)
      )
    return isRootOrSubpackageCss
      ? css
      : removeCssCoveredByRootStyleBundleSources(bundle, outputFile, css, { preserveSkylineTypography: isSkylineTypographyEnabledForContext(opts, runtimeState.tailwindRuntime.majorVersion, generatorPlatform) })
  }
  const shouldRegenerateMainPackageCssWithScopedCandidates = vitePipelineCssAsset && shouldExcludeSubpackageSourceCandidates(outputFile, generatorCssHandlerOptions)
  const vitePipelineCssInjectionOutputFile = webviewRootCssInjectionTarget ?? outputFile
  const shouldRecordVitePipelineCssByOutput = normalizeOutputPathKey(vitePipelineCssInjectionOutputFile) === normalizeOutputPathKey(outputFile)
  const shouldInjectVitePipelineCssIntoMain = vitePipelineCssAsset && !resolvedFromConfiguredOriginalCssEntry && outputCssHandlerOptions.isMainChunk !== true && (webviewRootCssInjectionTarget != null || shouldInjectCssIntoMainFromOutput(outputFile, generatorSourceFile, outputCssHandlerOptions))
  const isRuntimeLinkedCss = runtimeLinkedCssFiles.has(file) || runtimeLinkedCssFiles.has(outputFile)
  const cssTransformDecisionPlan = resolveViteCssTransformDecisionPlan({ alreadyProcessedCssAsset, cssAssetIdentityKind: cssAssetIdentity.kind, cssAssetSourceFile: cssAssetIdentity.sourceFile, cssIsMainChunk: cssHandlerOptions2.isMainChunk === true, generatorCandidateSignatureInitialized: state.generatorCandidateSignature !== void 0, generatorCandidatesChanged, generatorRawSource, hasCurrentTailwindGenerationDirective, hasRememberedApplySource, hasRuntimeAffectingChanges, hasSameOutputRememberedTailwindGenerationSource, hasStaleViteProcessedCssSource, isCollectedBundlerGeneratedCssFile: collectedBundlerGeneratedCssFiles.has(file), isProcessCssFile: processFiles.css.has(file), isRuntimeLinkedCss, rawSource, rememberedRawSource: rememberedCssSource?.rawSource, shouldProcessTailwindGeneration, shouldRegenerateMainPackageCssWithScopedCandidates, useIncrementalMode, vitePipelineCssAsset, viteProcessedCssAsset })
  const { shouldReplayLastCss, shouldReuseProcessedCss, shouldTrackGeneratorRuntime, strippedViteProcessedCss } = cssTransformDecisionPlan
  if (shouldReuseProcessedCss) {
    const nextCss = removeRootCoveredCssFromScopedAsset(strippedViteProcessedCss)
    applyCssResult(nextCss)
    markCssAssetProcessed?.(originalSource, outputFile)
    recordCssAssetResult?.(outputFile, nextCss)
    if (vitePipelineCssAsset && rememberedCssSource && generatorSourceKind) {
      rememberCssSource?.({ kind: generatorSourceKind, outputFile: vitePipelineCssInjectionOutputFile, rawSource: generatorRawSource, sourceFile: generatorSourceFile })
    }
    // 普通作者样式的兼容处理不能升级为生成来源，否则回滚时会误用旧 remembered source。
    if (vitePipelineCssAsset && shouldRecordVitePipelineCssByOutput) {
      recordViteProcessedCssAssetResult?.(vitePipelineCssInjectionOutputFile, nextCss, { injectIntoMain: outputCssHandlerOptions.isMainChunk ? false : shouldInjectVitePipelineCssIntoMain, outputFile: vitePipelineCssInjectionOutputFile })
    }
    if (vitePipelineCssAsset && shouldInjectVitePipelineCssIntoMain) {
      recordViteProcessedCssAssetResult?.(file, nextCss, { injectIntoMain: shouldInjectVitePipelineCssIntoMain, outputFile: vitePipelineCssInjectionOutputFile })
    }
    onUpdate(outputFile, rawSource, nextCss)
    debug('css skip vite-processed asset: %s', outputFile)
    return
  }
  // 复用产物只需保留归属与输出记录；生成候选、来源追踪和缓存签名由后续转换消费。
  const scopedSourceCandidateGetter = createScopedSourceCandidateGetter(outputFile, generatorCssHandlerOptions, generatorSourceFile)
  const scopedSourceCandidateSourceGetter = createScopedSourceCandidateSourceGetter(outputFile, generatorCssHandlerOptions, generatorSourceFile)
  const { scopedGeneratorRuntime, signatureSources, sourceTraceSources } = await createScopedGeneratorSourceData({ createScopedGeneratorRuntime, createScopedGeneratorSourceTraceMap: (source, file, options) => createScopedGeneratorSourceTraceMap(source, file, scopedSourceCandidateSourceGetter, options), generatorCssHandlerOptions, generatorRawSource, generatorRuntime, generatorSourceFile, rememberedCssSources, scopedSourceCandidateSourceGetter, outputFile })
  if (!options.isSourceCurrent()) {
    return
  }
  const sourceTraceTokenSources = sourceTraceSources ? createCssTokenSourceMap(sourceTraceSources, opts) : void 0
  const sourceTraceSignature = createCssSourceTraceCacheSignature(sourceTraceTokenSources, opts)
  const annotateCss = (css: string) => annotateCssSourceTrace(css, { opts, tokenSources: sourceTraceTokenSources })
  const generatorCssUserHandlerOptions = getCssUserHandlerOptions(generatorSourceFile)
  const cssRuntimeAffectingSignature = vitePipelineCssAsset ? createRuntimeAffectingSourceSignature(generatorRawSource, 'css') : snapshot.runtimeAffectingSignatureByFile.get(file) ?? createRuntimeAffectingSourceSignature(generatorRawSource, 'css')
  const cssRuntimeAffectingHash = vitePipelineCssAsset ? cache.computeHash(cssRuntimeAffectingSignature) : snapshot.runtimeAffectingHashByFile.get(file) ?? cache.computeHash(cssRuntimeAffectingSignature)
  const cssShareScope = createCssTransformShareScopeKey(opts, outputFile, generatorRawSource)
  const trackedGeneratorCandidateSignature = shouldTrackGeneratorRuntime ? createCandidateSignature(scopedGeneratorRuntime) : 'generator:stable'
  const scopedGeneratorCandidateSignature = shouldTrackGeneratorRuntime
    ? signatureSources.length > 1
      ? await createScopedGeneratorCandidateSignatureForSources({ createScopedGeneratorCandidateSignature, generatorCssHandlerOptions, majorVersion: runtimeState.tailwindRuntime.majorVersion, scopedSourceCandidateGetter, signatureSources, trackedGeneratorCandidateSignature })
      : await createScopedGeneratorCandidateSignature(generatorRawSource, generatorSourceFile, trackedGeneratorCandidateSignature, scopedSourceCandidateGetter, { includeFallbackSignature: generatorCssHandlerOptions.isMainChunk, majorVersion: runtimeState.tailwindRuntime.majorVersion })
    : trackedGeneratorCandidateSignature
  if (!options.isSourceCurrent()) {
    return
  }
  // 同一生成入口的产物还可合并普通作者样式，必须按本轮完整内容校验缓存。
  const cssTransformCachePlan = resolveViteCssTransformCachePlan({ hasCompiledGeneratorSource: cssCompositionPlan.hasCompiledGeneratorSource, cssBundleSourceHash: cache.computeHash(rawSource), cssIsMainChunk: cssHandlerOptions2.isMainChunk === true, cssRuntimeAffectingHash, cssShareScope, outputFile, runtimeSignature, scopedGeneratorCandidateSignature, sourceTraceSignature, tailwindcssMajorVersion: runtimeState.tailwindRuntime.majorVersion })
  const { cssCacheKey, cssHashKey, cssSharedCacheKey, cssTaskHash, rememberedCssRuntimeSignature } = cssTransformCachePlan
  if (shouldReplayLastCss) {
    const lastCss = getLastCssResult(lastCssResultByFile, outputFile, file)
    if (lastCss != null) {
      applyCssResult(lastCss)
      markCssAssetProcessed?.(originalSource, outputFile)
      metrics.css.cacheHits++
      debug('css replay last result: %s', outputFile)
      return
    }
  }
  rememberProcessCacheKey(cssCacheKey, cssHashKey)
  scheduleViteCssTransform({
    isSourceCurrent: options.isSourceCurrent,
    addWatchFile,
    annotateCss,
    applyCssResult,
    applyViteCssCacheResult,
    applyViteCssTransformTaskResult,
    assetSourceFile,
    cache,
    cssCacheKey,
    cssHandlerOptions: cssHandlerOptions2,
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
    generatorSourceKind,
    generatorUserLayerRawSource,
    hasCompiledGeneratorSource: cssCompositionPlan.hasCompiledGeneratorSource,
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
  })
  return true
}
