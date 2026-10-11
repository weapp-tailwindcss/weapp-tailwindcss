/* eslint-disable style/max-statements-per-line */
import type { OutputAsset, OutputBundle } from 'rollup'
import type { BundleStateEntry } from '../bundle-state'
import type { SourceCandidateCollector } from '../source-candidates'
import type { GenerateBundleContext, GenerateBundleThis, PendingRememberedCssReplayUpdate } from './types'
import type { CreateJsHandlerOptions } from '@/types'
import { Buffer } from 'node:buffer'
import path from 'node:path'
import process from 'node:process'
import { transformWebCssCompat } from '@weapp-tailwindcss/postcss/transform'
import { normalizeWeappTailwindcssGeneratorOptions } from '@/generator'
import { resolveGeneratorRuntimeBranch, shouldUseMiniProgramCssBranch } from '@/runtime-branch'
import { getRuntimeClassSetSignature } from '@/tailwindcss/runtime/cache'
import { filterUnsupportedMiniProgramTailwindV4Candidates } from '@/tailwindcss/v4-engine/candidates'
import { resolveUniUtsPlatform } from '@/utils'
import { collectGeneratedRawSourceCandidatesFromCss } from '../../../generation/class-selectors'
import { normalizeMiniProgramGeneratorCssSource } from '../../../generation/output-import-shell'
import { annotateCssSourceTrace, createCssSourceTraceCacheSignature, createCssTokenSourceMap } from '../../shared/css-source-trace'
import { hasBundlerGeneratedCssMarker } from '../../shared/generated-css-marker'
import { normalizeOutputPathKey } from '../../shared/module-graph'
import { createBundleModuleGraphOptions } from '../bundle-entries'
import { buildBundleSnapshot, createBundleBuildState } from '../bundle-state'
import { createCssHandlerOptionsCache, resolveViteCssHandlerExtraOptions } from '../css-handler-options'
import { resolveMiniProgramStyleOutputExtension, resolveMiniProgramStyleOutputExtension as resolveMiniProgramStyleOutputExtension2, resolveReplayCssOutputFile, resolveReplayCssOutputFile as resolveReplayCssOutputFile2, resolveReplayCssOutputFileFromSourceRoot, resolveViteCssPipelineOutputFile, resolveViteCssPipelineOutputFile as resolveViteCssPipelineOutputFile2, resolveViteCssPipelineOutputFileFromSourceFile } from '../css-output'
import { collectViteProcessedCssAssetResults, isCssImportOnlyBundleAsset, removeCssCoveredByRootStyleBundleSources } from '../processed-css-assets'
import { createRuntimeAffectingSourceSignature } from '../runtime-affecting-signature'
import { resolveSourceRootFromBundleGraph, resolveWeappViteSourceRoot } from '../weapp-vite-config'
import { resolveViteWebCssCompatOptions, shouldApplyViteWebCssCompat } from '../web-css-compat'
import { normalizeBundleFileNameKeysForTest } from './bundle-file-names'
import { collectBundleMarkupCandidates } from './bundle-markup-candidates'
import { createCssAssetEmitter, resolveAssetSourceFile } from './css-assets'
import { applyViteCssCacheResult, processViteCssCacheTask } from './css-cache-task'
import { resolveViteCssCompositionPlan } from './css-composition-plan'
import { normalizeRelativeCssConfigDirectives } from './css-config-directives'
import { processViteCssBundleEntry } from './css-entry-processing'
import { applyCssResultToBundle, hasViteProcessedCssResultForSource, resolveCssAssetOutputPlan, shouldSkipRawSourceStyleAsset } from './css-output-helpers'
import { createCssTransformShareScopeKey } from './css-share-scope'
import { resolveViteCssSourcePlan } from './css-source-plan'
import { resolveViteCssLinkedImpactSignature, resolveViteCssTransformCachePlan, resolveViteCssTransformDecisionPlan } from './css-transform-decision-plan'
import { applyViteCssTransformTaskResult } from './css-transform-result'
import { executeViteCssTransformTask } from './css-transform-task'
import { hasOmittedKnownBundleFiles } from './dirty-state'
import { resolveGenerateBundleEnvFlags } from './env-flags'
import { finalizeGenerateBundle } from './finalize'
import { processHtmlBundleEntry } from './html-processing'
import { createJsEntryResolver } from './js-entries'
import { createJsHandlerOptionsFactory, resolveGenerateBundleJsFastPath } from './js-handler-options'
import { createLinkedUpdateHelpers } from './js-linking'
import { processJsBundleEntry, replayCleanJsBundleEntry } from './js-processing'
import { createEmptyMetrics, measureElapsed } from './metrics'
import { logBundleProcessPlan } from './process-plan'
import { resolveRememberedCssSourceForTest } from './remembered-css'
import { processRememberedCssReplay, shouldSkipRawRememberedCssSource } from './remembered-css-replay'
import { isRootMiniProgramStyleOutputFile, resolveFrameworkRootImportShellPlan, shouldKeepRootMiniProgramStyleAsImportShell, shouldKeepRootMiniProgramStyleAsImportShell as shouldKeepRootMiniProgramStyleAsImportShell2, shouldMoveRootMiniProgramStyleToImportShellOrigin, shouldMoveRootMiniProgramStyleToImportShellOrigin as shouldMoveRootMiniProgramStyleToImportShellOrigin2 } from './root-style-output'
import { createConfiguredCssRootResolvers, createConfiguredCssSourceRegistry } from './runtime-configured-css'
import { collectCssExtensionByStem, collectJsImportedCssFiles, collectRuntimeLinkedCssFiles } from './runtime-linked-css'
import { rememberRuntimeLinkedCssSources } from './runtime-linked-source-memory'
import { createScopedGeneratorCandidateSignature, createScopedGeneratorSourceTraceMap, createScopedGeneratorRuntime as resolveScopedGeneratorRuntime } from './scoped-generator'
import { memoizeScopedGeneratorRuntime } from './scoped-generator-runtime-cache'
import { hasSfcStyleSources, resolveSourceStyleSourceFromOutputFile } from './sfc-style-source'
import { createCandidateSignature, hasRuntimeAffectingSourceChanges } from './signatures'
import { createSubpackageSourceCandidateScope } from './source-candidate-scope'
import { resolveCurrentSourceCandidateFile, resolveCurrentSourceCandidateSource } from './source-candidate-source'
import { collectMiniProgramSubpackageRoots, isSubpackageOutputFile } from './subpackages'
import { collectTemporaryCssSourceEntries, createTemporaryCssAssetSourceResolver, isTemporaryCssAssetFile } from './temporary-css-assets'
import { createBundleTaskTimer } from './timing'
import { createTransformFilter, createTransformFilterSignature, shouldSkipViteAssetTransform, shouldSkipViteJsChunkTransform } from './transform-filter'
import { validateRuntimeCandidates } from './validate-runtime-candidates'
import { getLastCssResult, normalizeViteCssCacheKey } from './vite-css-cache'

function inferPlatformFromViteOutDir(outDir: string | undefined) {
  const segment = outDir ? path.basename(path.normalize(outDir)) : void 0; if (!segment) {
    return void 0
  } const normalized = segment.trim().toLowerCase(); if (normalized === 'h5' || normalized === 'web' || normalized === 'app' || normalized === 'app-plus' || normalized.startsWith('app-') || normalized.startsWith('mp-') || normalized.startsWith('quickapp-webview')) {
    return normalized
  }
}
function createGenerateBundleHook(context: GenerateBundleContext) {
  const state = createBundleBuildState()
  const lastCssResultByFile = new Map<string, string>()
  const lastCssSourceHashByFile = new Map<string, string>()
  const lastCssRawSourceHashByFile = new Map<string, string>()
  const frameworkRootImportShellTargetByFile = context.frameworkRootImportShellTargetByFile ?? new Map<string, string>()
  let currentOutDir: string | undefined
  let currentSubpackageRoots: Set<string> | undefined
  const createInitialCssPipelineContext = (file: string) => { const resolvedConfig = context.getResolvedConfig(); const platform = context.opts.cssOptions?.platform ?? context.opts.platform ?? inferPlatformFromViteOutDir(resolvedConfig?.build?.outDir); const currentGeneratorOptions = normalizeWeappTailwindcssGeneratorOptions(context.opts.generator, { appType: context.opts.appType, platform, tailwindcssMajorVersion: context.runtimeState.tailwindRuntime.majorVersion, uniAppX: context.opts.uniAppX }); const currentGeneratorBranch = resolveGeneratorRuntimeBranch(currentGeneratorOptions, { appType: context.opts.appType, platform, tailwindcssMajorVersion: context.runtimeState.tailwindRuntime.majorVersion, uniAppX: context.opts.uniAppX }); return { currentGeneratorBranch, currentGeneratorOptions, file, opts: context.opts, resolvedConfig, resolveStylePlatform: () => platform } }
  const cssHandlerOptions = createCssHandlerOptionsCache({ getAppType: () => context.opts.appType, mainCssChunkMatcher: context.opts.mainCssChunkMatcher, getMajorVersion: () => context.runtimeState.tailwindRuntime.majorVersion, getOutputRoot: () => currentOutDir, getExtraOptions: file => ({ ...resolveViteCssHandlerExtraOptions(file), ...context.cssPipelineStrategy?.getCssHandlerExtraOptions?.(createInitialCssPipelineContext(file)) ?? {}, ...currentSubpackageRoots && isSubpackageOutputFile(file, currentSubpackageRoots) ? { isMainChunk: false } : {} }) })
  return async function generateBundle(this: GenerateBundleThis, _opt: unknown, bundle: OutputBundle) {
    if (context.shouldProcessBundle?.() === false) {
      await context.onSkipProcessBundle?.()
      return
    }
    const processMarkupAndScripts = context.processMarkupAndScripts !== false
    const processStyles = context.shouldProcessStyles?.() ?? context.processStyles !== false
    const addWatchFile = (id: string) => this.addWatchFile?.(id)
    const { opts, runtimeState, ensureBundleRuntimeClassSet, debug, getResolvedConfig, markCssAssetProcessed, isCssAssetProcessed, isViteProcessedCssAsset, resolveCssAssetIdentity, recordCssAssetResult, recordViteProcessedCssAssetResult, getViteProcessedCssAssetResults, getViteProcessedCssAssetResult, getSourceCandidates, getSourceCandidateSource, getSourceCandidateSources, extractSourceCandidates, getSourceCandidatesForEntries, getSourceCandidateSourcesForEntries, waitForSourceCandidateSyncs, rememberCssSource, getRememberedCssSources, getRememberedCssSignature, setRememberedCssSignature, getKnownCssSource, getKnownSfcSource, getOriginalCssLayerSource, recordGeneratorCandidates, pruneViteCssCaches, getViteCssCacheStats, hmrTimingRecorder } = context
    const getBundlerSfcSource = (sourceFile: string) => { const code = this.getModuleInfo?.(sourceFile)?.code; return typeof code === 'string' && hasSfcStyleSources(code) ? code : void 0 }
    const getSfcSource = (sourceFile: string) => getBundlerSfcSource(sourceFile) ?? getKnownSfcSource?.(sourceFile)
    const getCssSource = (sourceFile: string) => getKnownCssSource?.(sourceFile) ?? getSourceCandidateSource?.(sourceFile)
    const { cache, onEnd, onStart, onUpdate, styleHandler, templateHandler, jsHandler, uniAppX } = opts
    const resolvedConfig = getResolvedConfig()
    const uniUtsPlatform = resolveUniUtsPlatform()
    const generatorPlatform = opts.cssOptions?.platform ?? opts.platform ?? inferPlatformFromViteOutDir(resolvedConfig?.build?.outDir)
    const generatorOptions = normalizeWeappTailwindcssGeneratorOptions(opts.generator, { appType: opts.appType, platform: generatorPlatform, tailwindcssMajorVersion: runtimeState.tailwindRuntime.majorVersion, uniAppX, uniUtsPlatform })
    const generatorBranch = resolveGeneratorRuntimeBranch(generatorOptions, { appType: opts.appType, platform: generatorPlatform, tailwindcssMajorVersion: runtimeState.tailwindRuntime.majorVersion, uniAppX, uniUtsPlatform })
    const cssPipelineContext = { bundle, currentGeneratorBranch: generatorBranch, currentGeneratorOptions: generatorOptions, opts, resolvedConfig, resolveStylePlatform: () => generatorPlatform }
    const isWebGeneratorTarget = generatorBranch.isWeb
    const shouldApplyWebCssCompat = shouldApplyViteWebCssCompat(cssPipelineContext, context.cssPipelineStrategy)
    const transformWebTargetCss = (css: string) => { return context.cssPipelineStrategy?.transformGeneratedCss?.(css, { ...cssPipelineContext, defaultWebCssCompat: value => transformWebCssCompat(value, resolveViteWebCssCompatOptions(cssPipelineContext)), removeScopedPreflight: value => value, shouldApplyWebCssCompat }) ?? (shouldApplyWebCssCompat ? transformWebCssCompat(css, resolveViteWebCssCompatOptions(cssPipelineContext)) : css) }
    const isNativeAppStyleTarget = context.cssPipelineStrategy?.isNativeAppStyleTarget?.(cssPipelineContext) === true
    const isHarmonyAppStyleTarget = context.cssPipelineStrategy?.isHarmonyAppStyleTarget?.(cssPipelineContext) === true
    const shouldPreserveAppCssExtension = context.cssPipelineStrategy?.shouldPreserveStyleOutputExtension?.(cssPipelineContext) ?? (isNativeAppStyleTarget || isHarmonyAppStyleTarget)
    const shouldGenerateWebCssByGenerator = isWebGeneratorTarget
    const { getCssHandlerOptions, getCssUserHandlerOptions } = cssHandlerOptions
    const rootDir = resolvedConfig?.root ? path.resolve(resolvedConfig.root) : process.cwd()
    const sourceRoot = resolveWeappViteSourceRoot(resolvedConfig, opts.appType) ?? resolveSourceRootFromBundleGraph(resolvedConfig, bundle)
    const outDir = resolvedConfig?.build?.outDir ? path.resolve(rootDir, resolvedConfig.build.outDir) : rootDir
    const defaultStyleOutputExtension = resolveMiniProgramStyleOutputExtension({ files: Object.keys(bundle) })
    const normalizeMiniProgramGeneratorRawSource = (source: string, outputFile: string) => { return isWebGeneratorTarget ? source : normalizeMiniProgramGeneratorCssSource(source, outputFile, [...Object.keys(bundle), ...lastCssResultByFile.keys()]) }
    await runtimeState.readyPromise
    debug('start')
    onStart()
    const collectedBundlerGeneratedCssFiles = new Set(Object.entries(bundle).filter(([, output]) => output.type === 'asset' && hasBundlerGeneratedCssMarker(output.source)).map(([file]) => file))
    const subpackageRoots = collectMiniProgramSubpackageRoots(bundle)
    if (subpackageRoots) {
      currentSubpackageRoots = subpackageRoots
    }
    collectViteProcessedCssAssetResults(bundle, { opts, cssPipelineStrategy: context.cssPipelineStrategy, createCssPipelineContext: () => cssPipelineContext, isViteProcessedCssAsset, markCssAssetProcessed, recordCssAssetResult, recordViteProcessedCssAssetResult, resolveViteProcessedCssOutputFile: file => resolveViteCssPipelineOutputFile(file, opts, rootDir, isWebGeneratorTarget, shouldPreserveAppCssExtension, sourceRoot, defaultStyleOutputExtension, Object.keys(bundle)), subpackageRoots: currentSubpackageRoots, transformCss: transformWebTargetCss, debug })
    const hmrTimingStartedAt = performance.now()
    const timingDetails: Record<string, number> = {}
    const recordTimingDetail = (name: string, startedAt: number) => { timingDetails[name] = (timingDetails[name] ?? 0) + Math.max(0, performance.now() - startedAt) }
    const timeTask = createBundleTaskTimer(recordTimingDetail)
    const emitOrReplayCssAsset = createCssAssetEmitter(this, bundle)
    const metrics = createEmptyMetrics()
    const envFlags = resolveGenerateBundleEnvFlags()
    const bundleFiles = Object.keys(bundle)
    const activeViteCssCacheFiles = new Set(bundleFiles.map(normalizeViteCssCacheKey))
    const configuredCssSourceRegistry = createConfiguredCssSourceRegistry({
      bundleFiles,
      defaultStyleOutputExtension,
      getCssSource,
      isWebGeneratorTarget,
      opts,
      outDir,
      rootDir,
      runtimeState,
      sourceRoot,
    })
    const {
      explicitCssEntryFiles: configuredTailwindV4ExplicitCssEntryFiles,
      getSourceEntries: getConfiguredTailwindV4CssSourceEntries,
      normalizeGeneratorUserRawSource,
      resolveMatchedSourceOutputFile: resolveMatchedCssSourceOutputFile,
    } = configuredCssSourceRegistry
    const usedConfiguredTailwindV4CssSourceFiles = new Set<string>()
    const buildCommand = resolvedConfig?.command === 'build'
    const hasPreviousBundleState = state.iteration > 0 || state.sourceHashByFile.size > 0
    const hasOmittedKnownFiles = hasOmittedKnownBundleFiles(bundleFiles, state.sourceHashByFile.keys())
    const useIncrementalMode = !buildCommand || hasPreviousBundleState || hasOmittedKnownFiles
    currentOutDir = outDir
    const snapshotStart = performance.now()
    const snapshot = buildBundleSnapshot(bundle, opts, outDir, state, envFlags.disableDirtyOptimization || !useIncrementalMode, { hasOmittedKnownFiles })
    const configuredTailwindV4CssSourceEntriesForScope = getConfiguredTailwindV4CssSourceEntries()
    const configuredCssRootResolvers = createConfiguredCssRootResolvers({
      bundle,
      bundleFiles,
      cssPipelineContext,
      cssPipelineStrategy: context.cssPipelineStrategy,
      currentSubpackageRoots,
      defaultStyleOutputExtension,
      entries: configuredTailwindV4CssSourceEntriesForScope,
      rootImportShellTargets: frameworkRootImportShellTargetByFile,
      explicitCssEntryFiles: configuredTailwindV4ExplicitCssEntryFiles,
      isWebGeneratorTarget,
      opts,
      rootDir,
      shouldPreserveAppCssExtension,
      sourceRoot,
    })
    const {
      configuredTailwindV4ExplicitCssEntryFileKeysForScope,
      configuredTailwindV4CssSourceFileKeysForScope,
      hasExplicitConfiguredRootCssEntryForOutput,
      isMiniProgramStyleOutputFile,
      normalizeConfiguredTailwindV4CssEntryFileKey,
      resolveConfiguredCssEntryRootInjectionTarget,
      resolveConfiguredRootCssSourceStyle,
      selectConfiguredRootCssSourceEntry,
      shouldKeepCurrentRootCssOutputForConfiguredSource,
      shouldKeepCurrentRootMiniProgramStyleOutputAsImportShell,
      shouldSelectConfiguredRootCssOutput,
    } = configuredCssRootResolvers
    recordTimingDetail('snapshot', snapshotStart)
    const useBundleRuntimeClassSet = !isWebGeneratorTarget
    const forceRuntimeRefreshBySource = useIncrementalMode && hasRuntimeAffectingSourceChanges(snapshot.runtimeAffectingChangedByType)
    const processFiles = snapshot.processFiles
    logBundleProcessPlan({ debug, snapshot, useIncrementalMode, iteration: state.iteration + 1 })
    const sourceCandidateWaitStart = performance.now()
    await waitForSourceCandidateSyncs?.()
    recordTimingDetail('sourceCandidates.wait', sourceCandidateWaitStart)
    const transformFilter = createTransformFilter(opts.transform, rootDir)
    const bundleMarkupCandidates = await collectBundleMarkupCandidates({ extractSourceCandidates: processMarkupAndScripts && !isWebGeneratorTarget ? extractSourceCandidates : void 0, previousCandidatesByFile: useIncrementalMode ? state.bundleMarkupCandidatesByFile : void 0, preserveMissingFiles: useIncrementalMode && snapshot.hasOmittedKnownFiles, resolveSourceCandidateFile: file => resolveCurrentSourceCandidateFile({ file, getSourceCandidateSource, getSourceCandidateSources, outDir, rootDir, sourceRoot }), rootDir, snapshot, transformFilter })
    const getCombinedSourceCandidatesForEntries: SourceCandidateCollector['valuesForEntries'] | undefined = getSourceCandidatesForEntries || bundleMarkupCandidates.values.size > 0 ? (entries, options) => new Set([...getSourceCandidatesForEntries?.(entries, options) ?? [], ...bundleMarkupCandidates.valuesForEntries(entries, options)]) : void 0
    const sourceCandidates = new Set([...getSourceCandidates?.() ?? [], ...bundleMarkupCandidates.values])
    const { createScopedSourceCandidateGetter, createScopedSourceCandidateSourceGetter, shouldExcludeSubpackageSourceCandidates, shouldInjectCssIntoMainFromOutput } = createSubpackageSourceCandidateScope({ cssSourceFiles: configuredTailwindV4CssSourceEntriesForScope.map(entry => entry.file), getSourceCandidateSourcesForEntries, getSourceCandidatesForEntries: getCombinedSourceCandidatesForEntries, projectRoot: opts.tailwindcssRuntimeOptions?.projectRoot, rootDir, snapshot, sourceRoot, subpackageRoots: currentSubpackageRoots, tailwindcssBasedir: opts.tailwindcssBasedir, useIncrementalMode })
    const createScopedGeneratorRuntime = memoizeScopedGeneratorRuntime((outputFile, cssHandlerOptions2, runtime2, rawSource, sourceFile, scopeToSource) => resolveScopedGeneratorRuntime({ cssHandlerOptions: cssHandlerOptions2, fallbackRuntime: runtime2, getSourceCandidatesForEntries: getCombinedSourceCandidatesForEntries, majorVersion: runtimeState.tailwindRuntime.majorVersion, outputFile, rawSource, scopeToSource, shouldExcludeSubpackageSourceCandidates, sourceFile, scopedSourceCandidateGetter: createScopedSourceCandidateGetter(outputFile, cssHandlerOptions2, sourceFile) }))
    const jsEntries = snapshot.jsEntries
    const getJsEntry = createJsEntryResolver(jsEntries)
    const transformFilterSignature = createTransformFilterSignature(opts.transform)
    const jsFastPath = resolveGenerateBundleJsFastPath({ experimentalJsFastPath: opts.experimentalJsFastPath, useIncrementalMode })
    const moduleGraphOptions = jsFastPath.moduleGraphEnabled ? createBundleModuleGraphOptions(outDir, jsEntries) : undefined
    const hasRuntimeAffectingChanges = hasRuntimeAffectingSourceChanges(snapshot.runtimeAffectingChangedByType)
    const runtimeStart = performance.now()
    const forceV4RuntimeRefreshBySource = forceRuntimeRefreshBySource
    const runtime = isWebGeneratorTarget ? new Set<string>() : useBundleRuntimeClassSet ? await ensureBundleRuntimeClassSet(snapshot, envFlags.forceRuntimeRefreshByEnv, { allowBaselineOnlyInitialSync: buildCommand, refreshBySource: forceV4RuntimeRefreshBySource }) : await context.ensureRuntimeClassSet(envFlags.forceRuntimeRefreshByEnv)
    const shouldFilterTailwindV4MiniProgramCandidates = shouldUseMiniProgramCssBranch(generatorBranch)
    const collectedGeneratorCandidates = new Set([...runtime, ...sourceCandidates])
    const filteredGeneratorCandidates = shouldFilterTailwindV4MiniProgramCandidates ? filterUnsupportedMiniProgramTailwindV4Candidates(collectedGeneratorCandidates) : collectedGeneratorCandidates
    const filteredSourceCandidates = shouldFilterTailwindV4MiniProgramCandidates ? filterUnsupportedMiniProgramTailwindV4Candidates(sourceCandidates) : sourceCandidates
    const shouldTransformJsBundle = !isWebGeneratorTarget || context.cssPipelineStrategy?.shouldTransformServeJs?.(cssPipelineContext) === true
    const transformRuntime = isWebGeneratorTarget
      ? new Set<string>()
      : shouldFilterTailwindV4MiniProgramCandidates
        ? new Set(runtime)
        : new Set(filteredGeneratorCandidates)
    const generatorRuntime = filteredGeneratorCandidates
    const cssEntries = snapshot.entries.filter((entry): entry is BundleStateEntry & { output: OutputAsset } => entry.type === 'css' && entry.output.type === 'asset')
    const hasMultipleConfiguredCssEntries = (opts.cssEntries?.length ?? 0) > 1
    await validateRuntimeCandidates({
      cssEntries,
      debug,
      getCssHandlerOptions,
      getCssUserHandlerOptions,
      getViteProcessedCssAssetResults,
      hasMultipleConfiguredCssEntries,
      normalizeMiniProgramGeneratorRawSource,
      opts,
      runtimeState,
      sourceCandidates: filteredSourceCandidates,
      styleHandler,
      transformRuntime,
    })
    const generatorCandidateSignature = createCandidateSignature(generatorRuntime)
    const generatorCandidatesChanged = state.generatorCandidateSignature !== generatorCandidateSignature
    const cssExtensionByStem = collectCssExtensionByStem(bundleFiles, opts.cssMatcher)
    const jsImportedCssFiles = collectJsImportedCssFiles(snapshot)
    const runtimeLinkedCssFiles = new Set([...collectRuntimeLinkedCssFiles(snapshot, cssExtensionByStem, defaultStyleOutputExtension), ...jsImportedCssFiles])
    rememberRuntimeLinkedCssSources({ bundleFiles, debug, defaultStyleOutputExtension, getConfiguredTailwindV4CssSourceEntries, getSourceCandidateSource, getSourceCandidateSources, isWebGeneratorTarget, jsImportedCssFiles, opts, outDir, rememberCssSource, rootDir, runtimeLinkedCssFiles, shouldPreserveAppCssExtension, snapshot, sourceRoot })
    const temporaryCssSourceEntries = collectTemporaryCssSourceEntries({
      configuredEntries: getConfiguredTailwindV4CssSourceEntries().flatMap((entry) => {
        const outputFile = resolveMatchedCssSourceOutputFile(entry.file)
        return outputFile ? [{ file: entry.file, outputFile, source: entry.source }] : []
      }),
      configuredScopeEntries: configuredTailwindV4CssSourceEntriesForScope.flatMap((entry) => {
        const outputFile = resolveMatchedCssSourceOutputFile(entry.file)
        return outputFile ? [{ file: entry.file, outputFile, source: entry.source }] : []
      }),
      currentSubpackageRoots,
      explicitSourceFileKeys: configuredTailwindV4ExplicitCssEntryFileKeysForScope,
      isSubpackageOutputFile,
      normalizeConfiguredSourceFile: normalizeConfiguredTailwindV4CssEntryFileKey,
      rememberedEntries: [...getRememberedCssSources?.() ?? []].map(([, remembered]) => ({
        file: remembered.sourceFile,
        outputFile: remembered.outputFile,
        source: remembered.rawSource,
      })),
      resolveRuntimeLinkedSource: (file) => {
        if (snapshot.sourceHashByFile.has(file)) {
          return
        }
        const outputFile = resolveViteCssPipelineOutputFile(file, opts, rootDir, isWebGeneratorTarget, shouldPreserveAppCssExtension, sourceRoot, defaultStyleOutputExtension, bundleFiles)
        const inferredSource = resolveSourceStyleSourceFromOutputFile(outputFile, snapshot, outDir, sourceRoot, getCssSource, jsImportedCssFiles.has(file) ? getSourceCandidateSources : void 0, getConfiguredTailwindV4CssSourceEntries().map(entry => [entry.file, entry.source]), debug)
        return inferredSource
          ? { file: inferredSource.sourceFile, outputFile, source: inferredSource.rawSource }
          : undefined
      },
      runtimeLinkedCssFiles,
      shouldSelectConfiguredRootOutput: shouldSelectConfiguredRootCssOutput,
    })
    const temporaryCssAssetSourceResolver = createTemporaryCssAssetSourceResolver(temporaryCssSourceEntries)
    recordGeneratorCandidates?.(generatorRuntime)
    const dynamicRetryCandidates = new Set([...sourceCandidates, ...generatorRuntime, ...transformRuntime])
    metrics.runtimeSet = measureElapsed(runtimeStart)
    timingDetails['runtime'] = metrics.runtimeSet
    if (forceRuntimeRefreshBySource) {
      debug('runtimeSet forced refresh due to source changes: html=%d js=%d', snapshot.runtimeAffectingChangedByType.html.size, snapshot.runtimeAffectingChangedByType.js.size)
    }
    debug('get runtimeSet, class count: %d, transform class count: %d', runtime.size, transformRuntime.size)
    const runtimeSignature = getRuntimeClassSetSignature(runtimeState.tailwindRuntime) ?? 'runtime:missing'
    const transformRuntimeSignature = isWebGeneratorTarget
      ? generatorCandidateSignature
      : createCandidateSignature(transformRuntime)
    const shouldProcessTailwindGeneration = !useIncrementalMode || hasRuntimeAffectingChanges || generatorCandidatesChanged || snapshot.processFiles.css.size > 0
    const { applyLinkedUpdates, pendingLinkedUpdates } = createLinkedUpdateHelpers({ jsEntries, onUpdate, debug })
    const createBaseHandlerOptions = createJsHandlerOptionsFactory({ getExperimentalJsFastPath: () => jsFastPath.experimentalJsFastPath, getMajorVersion: () => runtimeState.tailwindRuntime.majorVersion, moduleGraph: moduleGraphOptions })
    const resolveFrameworkJsHandlerOptions = (absoluteFilename: string) => context.cssPipelineStrategy?.getServeJsHandlerOptions?.({ ...cssPipelineContext, file: absoluteFilename })
    const createHandlerOptions = (absoluteFilename: string, extra?: CreateJsHandlerOptions) => { const frameworkExtra = resolveFrameworkJsHandlerOptions(absoluteFilename); return createBaseHandlerOptions(absoluteFilename, frameworkExtra || extra ? { ...frameworkExtra, ...extra } : void 0) }
    const linkedByEntry = useIncrementalMode ? new Map<string, Set<string>>() : void 0
    const sharedCssResultCache = new Map()
    const activeProcessCacheKeys = new Set<string>()
    const activeProcessHashKeys = new Set<string | number>()
    const rememberProcessCacheKey = (cacheKey: string, hashKey: string | number = cacheKey) => { activeProcessCacheKeys.add(cacheKey); activeProcessHashKeys.add(hashKey) }
    const tasks: Promise<void>[] = []
    const cssTaskFactories: Array<() => Promise<void>> = []
    const jsTaskFactories: Array<() => Promise<void>> = []
    const pendingRememberedCssReplayUpdates: PendingRememberedCssReplayUpdate[] = []
    const entryPlanningStartedAt = performance.now()
    for (const entry of snapshot.entries) {
      const { file, output: originalSource, source: originalEntrySource, type } = entry
      if (processMarkupAndScripts && type === 'html' && originalSource.type === 'asset') {
        metrics.html.total++
        if (isWebGeneratorTarget) {
          debug('html skip web target: %s', file)
          continue
        }
        if (shouldSkipViteAssetTransform(originalSource, file, rootDir, transformFilter)) {
          metrics.html.transformed++
          debug('html skip transform (filtered): %s', file)
          continue
        }
        if (!processFiles.html.has(file)) {
          continue
        }
        processHtmlBundleEntry({ cache, context, debug, dynamicRetryCandidates, file, metrics, onUpdate, originalEntrySource, originalSource, rememberProcessCacheKey, resolveCurrentSourceCandidateSource: file2 => resolveCurrentSourceCandidateSource({ file: file2, getSourceCandidateSource, getSourceCandidateSources, outDir, rootDir, sourceRoot }), tasks, templateHandler, timeTask, transformRuntime, transformRuntimeSignature })
        continue
      }
      if (processStyles && type === 'css' && originalSource.type === 'asset') {
        await processViteCssBundleEntry({
          activeViteCssCacheFiles,
          addWatchFile,
          annotateCssSourceTrace,
          applyCssResultToBundle,
          applyViteCssCacheResult,
          applyViteCssTransformTaskResult,
          bundle,
          bundleFiles,
          cache,
          collectedBundlerGeneratedCssFiles,
          configuredTailwindV4CssSourceFileKeysForScope,
          configuredTailwindV4ExplicitCssEntryFileKeysForScope,
          context,
          createCandidateSignature,
          createCssSourceTraceCacheSignature,
          createCssTokenSourceMap,
          createCssTransformShareScopeKey,
          createInitialCssPipelineContext,
          createRuntimeAffectingSourceSignature,
          createScopedGeneratorCandidateSignature,
          createScopedGeneratorRuntime,
          createScopedGeneratorSourceTraceMap,
          createScopedSourceCandidateGetter,
          createScopedSourceCandidateSourceGetter,
          cssTaskFactories,
          currentSubpackageRoots,
          debug,
          defaultStyleOutputExtension,
          emitOrReplayCssAsset,
          envFlags,
          executeViteCssTransformTask,
          file,
          frameworkRootImportShellTargetByFile,
          generatorCandidatesChanged,
          generatorPlatform,
          generatorRuntime,
          getConfiguredTailwindV4CssSourceEntries,
          getCssHandlerOptions,
          getCssSource,
          getCssUserHandlerOptions,
          getLastCssResult,
          getOriginalCssLayerSource,
          getRememberedCssSources,
          getSfcSource,
          getSourceCandidateSources,
          getViteProcessedCssAssetResult,
          getViteProcessedCssAssetResults,
          hasExplicitConfiguredRootCssEntryForOutput,
          hasRuntimeAffectingChanges,
          hasViteProcessedCssResultForSource,
          isCssAssetProcessed,
          isCssImportOnlyBundleAsset,
          isMiniProgramStyleOutputFile,
          isRootMiniProgramStyleOutputFile,
          isSubpackageOutputFile,
          isTemporaryCssAssetFile,
          isViteProcessedCssAsset,
          isWebGeneratorTarget,
          lastCssResultByFile,
          lastCssSourceHashByFile,
          markCssAssetProcessed,
          measureElapsed,
          metrics,
          normalizeConfiguredTailwindV4CssEntryFileKey,
          normalizeGeneratorUserRawSource,
          normalizeMiniProgramGeneratorRawSource,
          normalizeOutputPathKey,
          normalizeRelativeCssConfigDirectives,
          normalizeViteCssCacheKey,
          onUpdate,
          opts,
          originalEntrySource,
          originalSource,
          outDir,
          processFiles,
          processViteCssCacheTask,
          recordCssAssetResult,
          recordViteProcessedCssAssetResult,
          rememberCssSource,
          rememberProcessCacheKey,
          removeCssCoveredByRootStyleBundleSources,
          resolveAssetSourceFile,
          resolveConfiguredCssEntryRootInjectionTarget,
          resolveConfiguredRootCssSourceStyle,
          resolveCssAssetIdentity,
          resolveCssAssetOutputPlan,
          resolveFrameworkRootImportShellPlan,
          resolveMatchedCssSourceOutputFile,
          resolveReplayCssOutputFile,
          resolveViteCssCompositionPlan,
          resolveViteCssLinkedImpactSignature,
          resolveViteCssPipelineOutputFile,
          resolveViteCssSourcePlan,
          resolveViteCssTransformCachePlan,
          resolveViteCssTransformDecisionPlan,
          rootDir,
          runtimeLinkedCssFiles,
          runtimeSignature,
          runtimeState,
          selectConfiguredRootCssSourceEntry,
          sharedCssResultCache,
          shouldExcludeSubpackageSourceCandidates,
          shouldGenerateWebCssByGenerator,
          shouldInjectCssIntoMainFromOutput,
          shouldKeepCurrentRootCssOutputForConfiguredSource,
          shouldKeepCurrentRootMiniProgramStyleOutputAsImportShell,
          shouldKeepRootMiniProgramStyleAsImportShell,
          shouldMoveRootMiniProgramStyleToImportShellOrigin,
          shouldPreserveAppCssExtension,
          shouldProcessTailwindGeneration,
          shouldSkipRawRememberedCssSource,
          shouldSkipRawSourceStyleAsset,
          shouldSkipViteAssetTransform,
          snapshot,
          sourceRoot,
          state,
          styleHandler,
          temporaryCssAssetSourceResolver,
          timeTask,
          transformFilter,
          transformRuntime,
          transformWebTargetCss,
          useIncrementalMode,
          usedConfiguredTailwindV4CssSourceFiles,
        })
        continue
      }
      if (type !== 'js') {
        continue
      }
      if (!processMarkupAndScripts) {
        continue
      }
      if (!shouldTransformJsBundle) {
        debug('js skip web target: %s', file)
        continue
      }
      if (replayCleanJsBundleEntry({ cache, debug, entry, metrics, rememberProcessCacheKey, snapshot, transformFilterSignature, transformRuntimeSignature, useIncrementalMode })) {
        continue
      }
      processJsBundleEntry({ applyLinkedUpdates, bundle, cache, createHandlerOptions, debug, deferUniAppXStylePlaceholder: opts.appType === 'uni-app-x', disableJsPrecheck: envFlags.disableJsPrecheck, entry, getJsEntry, jsHandler, jsTaskFactories, linkedByEntry, metrics, onUpdate, outDir, processFiles, rememberProcessCacheKey, runtimeSignature, snapshot, transformFilterSignature, shouldSkipAstTransform: transformFilter ? chunk => shouldSkipViteJsChunkTransform(chunk, transformFilter) : void 0, slowJsAstWarnMs: envFlags.slowJsAstWarnMs, timeTask, transformRuntime, transformRuntimeSignature, uniAppX, useIncrementalMode })
    }
    recordTimingDetail('entries.plan', entryPlanningStartedAt)
    const rememberedCssStartedAt = performance.now()
    if (processStyles && (shouldProcessTailwindGeneration || useIncrementalMode || isNativeAppStyleTarget)) {
      await processRememberedCssReplay({ addWatchFile, activeViteCssCacheFiles, bundle, bundleFiles, cache, changedCssFiles: snapshot.changedByType.css, cssTaskFactories, cssPipelineContext, cssPipelineStrategy: context.cssPipelineStrategy, createScopedGeneratorRuntime, createScopedSourceCandidateGetter, createScopedSourceCandidateSourceGetter, debug, defaultStyleOutputExtension, emitOrReplayCssAsset, frameworkRootImportShellTargetByFile, generatorPlatform, generatorRuntime, getCssHandlerOptions, getCssUserHandlerOptions, getRememberedCssSignature, getRememberedCssSources, isNativeAppStyleTarget, isWebGeneratorTarget, lastCssRawSourceHashByFile, lastCssResultByFile, lastCssSourceHashByFile, markCssAssetProcessed, metrics, normalizeViteCssCacheKey, onUpdate, opts, pendingRememberedCssReplayUpdates, recordCssAssetResult, recordViteProcessedCssAssetResult, rootDir, runtimeState, setRememberedCssSignature, shouldInjectCssIntoMainFromOutput, shouldPreserveAppCssExtension, sourceRoot, styleHandler, timeTask, useIncrementalMode })
    }
    recordTimingDetail('rememberedCss.plan', rememberedCssStartedAt)
    const prepareJsTransformRuntime = isWebGeneratorTarget && shouldTransformJsBundle
      ? () => {
          transformRuntime.clear()
          const cssSources = new Set<string>()
          for (const output of Object.values(bundle)) {
            if (output.type !== 'asset' || !opts.cssMatcher(output.fileName)) {
              continue
            }
            cssSources.add(typeof output.source === 'string' ? output.source : Buffer.from(output.source).toString())
          }
          for (const [, record] of getViteProcessedCssAssetResults?.() ?? []) {
            cssSources.add(typeof record === 'string' ? record : record.css)
          }
          for (const candidate of collectGeneratedRawSourceCandidatesFromCss(generatorRuntime, cssSources, opts.escapeMap)) {
            transformRuntime.add(candidate)
          }
          debug('rebuild webview JS transform class set from generated CSS: %d', transformRuntime.size)
        }
      : undefined
    await finalizeGenerateBundle({ activeProcessCacheKeys, activeProcessHashKeys, activeViteCssCacheFiles, bundle, bundleFiles, cache, cssTaskFactories, cssPipelineStrategy: context.cssPipelineStrategy, createCssPipelineContext: () => cssPipelineContext, debug, defaultStyleOutputExtension, formatIteration: useIncrementalMode ? state.iteration : 0, generatorCandidateSignature, generatorRuntime, getCssHandlerOptions, getSourceCandidateSourcesForEntries, getSourceCandidatesForEntries: getCombinedSourceCandidatesForEntries, getViteCssCacheStats, getViteProcessedCssAssetResults, hmrTimingRecorder, hmrTimingStartedAt, isHarmonyAppStyleTarget, isNativeAppStyleTarget, isViteProcessedCssAsset, isWebGeneratorTarget, jsAfterCss: (shouldFilterTailwindV4MiniProgramCandidates || (isWebGeneratorTarget && shouldTransformJsBundle)) && cssTaskFactories.length > 0, jsTaskFactories, lastCssResultByFile, lastCssSourceHashByFile, linkedByEntry, markCssAssetProcessed, metrics, onEnd, onUpdate, opts, outDir, pendingLinkedUpdates, pendingRememberedCssReplayUpdates, prepareJsTransformRuntime, pruneViteCssCaches, recordCssAssetResult, recordTimingDetail, recordViteProcessedCssAssetResult, rootDir, runtime, runtimeState, shouldPreserveAppCssExtension, snapshot, sourceCandidates, sourceRoot, state, styleHandler, tasks, timingDetails, transformRuntime, transformWebTargetCss, useIncrementalMode })
    state.bundleMarkupCandidatesByFile = bundleMarkupCandidates.candidatesByFile
  }
}
export { createGenerateBundleHook, normalizeBundleFileNameKeysForTest, resolveMiniProgramStyleOutputExtension2 as resolveMiniProgramStyleOutputExtension, resolveRememberedCssSourceForTest, resolveReplayCssOutputFile2 as resolveReplayCssOutputFile, resolveReplayCssOutputFileFromSourceRoot, resolveViteCssPipelineOutputFile2 as resolveViteCssPipelineOutputFile, resolveViteCssPipelineOutputFileFromSourceFile, shouldKeepRootMiniProgramStyleAsImportShell2 as shouldKeepRootMiniProgramStyleAsImportShell, shouldMoveRootMiniProgramStyleToImportShellOrigin2 as shouldMoveRootMiniProgramStyleToImportShellOrigin }
