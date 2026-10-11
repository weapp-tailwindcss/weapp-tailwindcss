import type { ViteFrameworkCssPipelineContext } from '../../shared/framework-strategy'
import type { FinalizeGenerateBundleOptions } from './root-import-shell'
import { injectUniAppXHarmonyBundleStyles } from '@/uni-app-x/style-asset'
import { runWithConcurrency } from '../../../../utils/run-tasks'
import { updateBundleBuildState } from '../../bundle-state'
import { removeCssCoveredByRootStyleAssets, removeDuplicateUnlinkedRootCssAssetsReferencedByHtml } from '../../processed-css-assets'
import { normalizeBundleFileNameKeysForTest } from '../bundle-file-names'
import { finalizeMiniProgramCssAssets } from '../final-css-assets'
import { resolveViteMemoryDebugStats } from '../memory-debug'
import { formatCacheHitRate, formatMs } from '../metrics'
import { collectMiniProgramSubpackageRoots } from '../subpackages'
import { handleUniAppXPostCssTasks } from '../uni-app-x-postprocess'
import { pruneLastCssResults, resolveViteCssTaskConcurrency } from '../vite-css-cache'
import { finalizeWebviewCssCompat, normalizeRootMiniProgramImportShellAssets } from './root-import-shell'
import { syncProcessedCss } from './sync-processed-css'

export async function finalizeGenerateBundle(options: FinalizeGenerateBundleOptions) {
  const {
    activeProcessCacheKeys,
    activeProcessHashKeys,
    activeViteCssCacheFiles,
    bundle,
    bundleFiles,
    cache,
    cssTaskFactories,
    cssPipelineStrategy,
    createCssPipelineContext,
    debug,
    formatIteration,
    generatorCandidateSignature,
    generatorRuntime,
    getCssHandlerOptions,
    getSourceCandidateSourcesForEntries,
    getSourceCandidatesForEntries,
    getViteCssCacheStats,
    getViteProcessedCssAssetResults,
    hmrTimingRecorder,
    hmrTimingStartedAt,
    isHarmonyAppStyleTarget,
    isNativeAppStyleTarget,
    isViteProcessedCssAsset,
    isWebGeneratorTarget,
    jsAfterCss,
    jsTaskFactories,
    lastCssResultByFile,
    lastCssSourceHashByFile,
    linkedByEntry,
    metrics,
    onEnd,
    onUpdate,
    opts,
    outDir,
    pendingLinkedUpdates,
    prepareJsTransformRuntime,
    pruneViteCssCaches,
    recordCssAssetResult,
    recordTimingDetail,
    runtime,
    runtimeState,
    snapshot,
    sourceCandidates,
    state,
    styleHandler,
    tasks,
    timingDetails,
    transformRuntime,
    useIncrementalMode,
  } = options
  const tasksStart = performance.now()
  if (cssTaskFactories.length > 0) {
    const cssConcurrency = resolveViteCssTaskConcurrency(useIncrementalMode, runtimeState.tailwindRuntime.majorVersion)
    const cssTask = runWithConcurrency(cssTaskFactories, cssConcurrency).then(() => undefined)
    if (jsAfterCss) {
      await cssTask
    }
    else {
      tasks.push(cssTask)
    }
  }
  prepareJsTransformRuntime?.()
  if (jsTaskFactories.length > 0) {
    tasks.push(runWithConcurrency(jsTaskFactories).then(() => undefined))
  }
  await Promise.all(tasks)
  recordTimingDetail('tasks', tasksStart)
  for (const apply of pendingLinkedUpdates) {
    apply()
  }
  const uniAppXPostCssStartedAt = performance.now()
  const applyStyleSources = await handleUniAppXPostCssTasks({
    bundle,
    debug,
    deferStylePlaceholderInjection: opts.appType === 'uni-app-x',
    generatorRuntime,
    getCssHandlerOptions,
    getSourceCandidateSourcesForEntries,
    getSourceCandidatesForEntries,
    getViteProcessedCssAssetResults,
    isHarmonyAppStyleTarget,
    isNativeAppStyleTarget,
    onUpdate,
    opts,
    runtimeState,
    styleHandler,
  })
  recordTimingDetail('finalize.uniAppXPostCss', uniAppXPostCssStartedAt)
  const processedCssStartedAt = performance.now()
  syncProcessedCss(options)
  if (isHarmonyAppStyleTarget && applyStyleSources.length > 0) {
    const viteProcessedCssSources = [...(getViteProcessedCssAssetResults?.() ?? [])]
      .map(([, record]) => typeof record === 'string' ? record : record.css)
    if (injectUniAppXHarmonyBundleStyles(bundle, { cssSources: viteProcessedCssSources })) {
      debug('uni-app-x harmony bundle styles inject after css assets')
    }
    syncProcessedCss(options)
  }
  recordTimingDetail('finalize.processedCss', processedCssStartedAt)
  const createFinalizeCssPipelineContext = (file = ''): ViteFrameworkCssPipelineContext | undefined => createCssPipelineContext?.(file)
  const finalizeCssPipelineContext = createFinalizeCssPipelineContext()
  const rootCssStartedAt = performance.now()
  normalizeRootMiniProgramImportShellAssets(bundle, {
    cssMatcher: opts.cssMatcher,
    debug,
    enabled: finalizeCssPipelineContext !== undefined
      && cssPipelineStrategy?.shouldNormalizeRootMiniProgramImportShell?.(finalizeCssPipelineContext) === true,
    onUpdate,
    recordCssAssetResult,
  })
  normalizeBundleFileNameKeysForTest(bundle)
  removeCssCoveredByRootStyleAssets(bundle, {
    cssMatcher: opts.cssMatcher,
    debug,
    includeTailwindGeneratedCssAssets: finalizeCssPipelineContext !== undefined
      && cssPipelineStrategy?.includeTailwindGeneratedCssAssetsInRootCoverage?.({
        ...finalizeCssPipelineContext,
        bundleFiles,
        isWebGeneratorTarget,
        outDir,
      }) === true,
    isViteProcessedCssAsset,
    onUpdate,
    recordCssAssetResult,
    subpackageRoots: collectMiniProgramSubpackageRoots(bundle),
  })
  if (
    finalizeCssPipelineContext !== undefined
    && cssPipelineStrategy?.shouldRemoveDuplicateUnlinkedRootCssAssetsReferencedByHtml?.({
      ...finalizeCssPipelineContext,
      bundleFiles: Object.keys(bundle),
      isWebGeneratorTarget,
      outDir,
    }) === true
  ) {
    removeDuplicateUnlinkedRootCssAssetsReferencedByHtml(bundle, { debug })
  }
  recordTimingDetail('finalize.rootCss', rootCssStartedAt)
  const finalCssAssetsStartedAt = performance.now()
  await finalizeMiniProgramCssAssets(bundle, {
    cssMatcher: opts.cssMatcher,
    debug,
    getCssHandlerOptions,
    isWebGeneratorTarget,
    lastCssResultByFile,
    onUpdate,
    recordCssAssetResult,
    styleHandler,
  })
  recordTimingDetail('finalize.cssAssets', finalCssAssetsStartedAt)
  const webCompatStartedAt = performance.now()
  if (
    finalizeCssPipelineContext !== undefined
    && cssPipelineStrategy?.shouldApplyFinalWebviewCssCompat?.({
      ...finalizeCssPipelineContext,
      bundleFiles: Object.keys(bundle),
      isWebGeneratorTarget,
      outDir,
    }) === true
  ) {
    finalizeWebviewCssCompat(bundle, {
      debug,
      onUpdate,
      opts,
      recordCssAssetResult,
    })
  }
  recordTimingDetail('finalize.webCompat', webCompatStartedAt)

  const stateUpdateStart = performance.now()
  updateBundleBuildState(
    state,
    snapshot,
    useIncrementalMode ? (linkedByEntry ?? new Map<string, Set<string>>()) : new Map<string, Set<string>>(),
    { incremental: useIncrementalMode },
  )
  state.generatorCandidateSignature = generatorCandidateSignature
  const shouldPruneTransientCaches = !snapshot.hasOmittedKnownFiles
  const processCachePruned = useIncrementalMode && shouldPruneTransientCaches && typeof cache.prune === 'function'
  const processCachePruneSkipReason = processCachePruned
    ? undefined
    : !useIncrementalMode
        ? 'full-mode'
        : !shouldPruneTransientCaches
            ? 'omitted-known-files'
            : 'cache-prune-unavailable'
  if (processCachePruned) {
    cache.prune?.({
      cacheKeys: activeProcessCacheKeys,
      hashKeys: activeProcessHashKeys,
    })
  }
  if (shouldPruneTransientCaches) {
    pruneLastCssResults(lastCssResultByFile, lastCssSourceHashByFile, activeViteCssCacheFiles)
    pruneViteCssCaches?.({
      activeFiles: activeViteCssCacheFiles,
      activeKnownSfcFiles: new Set([
        ...snapshot.sourceHashByFile.keys(),
        ...snapshot.entries.map(entry => entry.file),
      ]),
    })
  }
  recordTimingDetail('state.update', stateUpdateStart)

  debug(
    'metrics iteration=%d runtime=%sms html(total=%d transform=%d hit=%d rate=%s elapsed=%sms) js(total=%d transform=%d hit=%d rate=%s elapsed=%sms) css(total=%d transform=%d hit=%d rate=%s elapsed=%sms)',
    formatIteration,
    formatMs(metrics.runtimeSet),
    metrics.html.total,
    metrics.html.transformed,
    metrics.html.cacheHits,
    formatCacheHitRate(metrics.html),
    formatMs(metrics.html.elapsed),
    metrics.js.total,
    metrics.js.transformed,
    metrics.js.cacheHits,
    formatCacheHitRate(metrics.js),
    formatMs(metrics.js.elapsed),
    metrics.css.total,
    metrics.css.transformed,
    metrics.css.cacheHits,
    formatCacheHitRate(metrics.css),
    formatMs(metrics.css.elapsed),
  )

  if (hmrTimingRecorder) {
    hmrTimingRecorder.record('generateBundle', performance.now() - hmrTimingStartedAt, {
      ...timingDetails,
      memoryDebug: resolveViteMemoryDebugStats({
        activeProcessCacheKeys,
        activeProcessHashKeys,
        cache,
        generatorRuntimeSize: generatorRuntime.size,
        getViteCssCacheStats,
        hasOmittedKnownFiles: snapshot.hasOmittedKnownFiles,
        lastCssResultByFile,
        phase: 'generateBundle',
        processCachePruned,
        processCachePruneSkipReason,
        runtimeSize: runtime.size,
        sourceCandidatesSize: sourceCandidates.size,
        transformRuntimeSize: transformRuntime.size,
        useIncrementalMode,
      }),
    })
    hmrTimingRecorder.emitTotal()
  }
  onEnd()
  debug('end')
}
