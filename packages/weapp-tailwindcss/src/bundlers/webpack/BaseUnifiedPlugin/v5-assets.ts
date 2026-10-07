import type { SetupWebpackV5ProcessAssetsHookOptions, WebpackSourceLike } from './v5-assets/helpers'
import type { WebpackCssHandlerOptions } from './v5-assets/pipeline-helpers'
import path from 'node:path'
import process from 'node:process'
import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { LRUCache } from 'lru-cache'
import { beginCompilerShadowRun, createCompilationDependencyChanges, createRuntimeCompilationAffectingSignature, createRuntimeCompilationBuildState, finalizeCompilerShadowRun, getCompilationScopeDependencyRevision, recordCompilationDependencyChanges, resetRuntimeCompilationBuildState, updateRuntimeCompilationBuildState } from '@/compiler'
import { pluginName } from '@/constants'
import { normalizeWeappTailwindcssGeneratorOptions } from '@/generator'
import { ensureRuntimeClassSet } from '@/tailwindcss/runtime'
import { getRuntimeClassSetSignature } from '@/tailwindcss/runtime/cache'
import { warnFinalRpxThemeRisk } from '@/tailwindcss/v4/rpx-theme-warning'
import { getGroupedEntries } from '@/utils'
import { resolveTaskConcurrency } from '../../../utils/run-tasks'
import { annotateCssSourceTrace, createCssSourceTraceCacheSignature, isCssSourceTraceEnabled } from '../../shared/css-source-trace'
import { createRuntimeClassSetManager } from '../../shared/runtime-class-set'
import { collectStrictEscapedRuntimeCandidates, createEscapeFragments } from '../../shared/runtime-class-set/escaped-candidates'
import { createCandidateSignature } from '../../shared/runtime-signatures'
import { createAssetHashByChunkMap, createWebpackCssAssetResourceMap, createWebpackDirectCssAssetResourceMap } from './shared'
import { createWebpackCssSourceResolvers } from './v5-assets/css-source-resolvers'
import { finalizeWebpackProcessAssets } from './v5-assets/finalize-assets'
import { processWebpackGeneratedCssAsset } from './v5-assets/generated-css-task'
import { buildWebpackBundleSnapshot, createWebpackAssetUpdater, releaseWebpackBundleSnapshotSources } from './v5-assets/helpers'
import { enqueueWebpackHtmlAndJsTasks } from './v5-assets/html-js-tasks'
import { applyWebpackLinkedJsResults, createWebpackJsAssetModuleGraph } from './v5-assets/js-module-graph'
import {
  addRuntimeTransformCandidates,
  collectGeneratedCssRuntimeCandidates,
  collectWebpackJsRuntimeCandidatesFromAssets,
  collectWebpackJsRuntimeTokenSignature,
  createWebpackCssSourceTraceTokenSources,
  finalizeTracedWebpackCssAsset,
  finalizeWebpackCssAssetOutputSource,
  finalizeWebpackCssAssetSource,
  getRuntimeClassSetSync,
  isRuntimeTransformCandidate,
  resolveWebpackCssAssetModuleResource,
  stringifyWebpackSourceLike,
} from './v5-assets/pipeline-helpers'
import { processWebpackProcessedCssAsset } from './v5-assets/processed-css-task'
import { createWebpackSourceCandidateScanCache } from './v5-assets/source-candidate-cache'
import { refreshWebpackSourceCandidates } from './v5-assets/source-candidate-refresh'

export * from './v5-assets/pipeline-helpers'

export function setupWebpackV5ProcessAssetsHook(options: SetupWebpackV5ProcessAssetsHookOptions) {
  const {
    compiler,
    options: compilerOptions,
    appType,
    runtimeState,
    getRuntimeRefreshRequirement,
    refreshRuntimeMetadata,
    isKnownWebpackProcessedCssAsset,
    isWebpackProcessedCssAsset,
    consumeRuntimeRefreshRequirement,
    isWatchMode,
    getWatchChangedFiles,
    getCompilationChangeRecord,
    runtimeClassSetManager,
    getWebpackCssSources,
    getWebpackGeneratedCssSources,
    pruneWebpackCssSources,
    prepareWebpackCssSources,
    debug,
  } = options
  const { Compilation, sources } = compiler.webpack
  const { ConcatSource } = sources
  const generatorOptions = normalizeWeappTailwindcssGeneratorOptions(compilerOptions.generator, {
    appType: compilerOptions.appType,
    platform: compilerOptions.cssOptions?.platform ?? compilerOptions.platform,
    tailwindcssMajorVersion: runtimeState.tailwindRuntime.majorVersion,
    uniAppX: compilerOptions.uniAppX,
  })
  const isWebGeneratorTarget = generatorOptions.target === 'web'
  const cssHandlerOptionsCache = new Map<string, WebpackCssHandlerOptions>()
  const cssUserHandlerOptionsCache = new Map<string, WebpackCssHandlerOptions>()
  const webpackSourceCandidateScanCache = createWebpackSourceCandidateScanCache()
  const bundleBuildState = createRuntimeCompilationBuildState()
  const bundleRuntimeClassSetManager = runtimeClassSetManager ?? createRuntimeClassSetManager()
  const escapeFragments = createEscapeFragments(MappingChars2String)
  const processedCssAssetSkipDecisionCache = new LRUCache<string, boolean>({ max: 256 })

  compiler.hooks.compilation.tap(pluginName, (compilation) => {
    compilation.hooks.processAssets.tapPromise(
      {
        name: pluginName,
        stage: Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE,
      },
      async (assets) => {
        const entries = Object.entries(assets)
        if (entries.length === 0) {
          return
        }
        const groupedEntries = getGroupedEntries(entries, compilerOptions)
        // 无匹配产物的子编译不应扫描源码或消费父编译共享的刷新标记与缓存。
        if (compilation.compiler?.isChild?.()
          && groupedEntries.css.length === 0
          && groupedEntries.html.length === 0
          && groupedEntries.js.length === 0) {
          return
        }
        if (isWebGeneratorTarget && groupedEntries.css.length === 0) {
          return
        }
        beginCompilerShadowRun(runtimeState)
        compilerOptions.onStart()
        debug('start')
        await runtimeState.readyPromise
        const hmrTimingStartedAt = performance.now()
        const timingDetails: Record<string, number> = {}
        const recordTimingDetail = (name: string, startedAt: number) => {
          timingDetails[name] = (timingDetails[name] ?? 0) + Math.max(0, performance.now() - startedAt)
        }
        const setupStartedAt = performance.now()

        // Initial pass marks cache state.
        for (const chunk of compilation.chunks) {
          if (chunk.id && chunk.hash) {
            compilerOptions.cache.calcHashValueChanged(chunk.id, chunk.hash)
          }
        }
        const assetHashByChunk = createAssetHashByChunkMap(compilation.chunks as any)
        const { updateAssetIfChanged } = createWebpackAssetUpdater({
          compilation,
          ConcatSource,
          onUpdate: compilerOptions.onUpdate,
          debug,
        })

        const compilerOutputPath = compilation.compiler?.outputPath ?? compiler.outputPath
        const outputDir = compilerOutputPath
          ? path.resolve(compilerOutputPath)
          : (compilation.outputOptions?.path ?? process.cwd())
        const { jsAssets, moduleGraphOptions } = createWebpackJsAssetModuleGraph({
          compilation,
          compilerOptions,
          entries,
          outputDir,
        })
        const watchMode = isWatchMode?.() === true
        const cssAssetResources = createWebpackCssAssetResourceMap(
          compilation.chunks as Iterable<{ files?: Iterable<string> | string[] | undefined, hasRuntime?: () => boolean, name?: string | undefined }>,
          (compilation as { chunkGraph?: { getChunkModulesIterable?: (chunk: unknown) => Iterable<{ resource?: string }> | undefined } }).chunkGraph as any,
          compilerOptions.cssMatcher,
          (resource, issuer) => resolveWebpackCssAssetModuleResource(resource, issuer, {
            appType,
            cssMatcher: compilerOptions.cssMatcher,
          }),
        )
        const directCssAssetResources = createWebpackDirectCssAssetResourceMap(
          compilation.chunks as Iterable<{ files?: Iterable<string> | string[] | undefined, hasRuntime?: () => boolean, name?: string | undefined }>,
          (compilation as { chunkGraph?: { getChunkModulesIterable?: (chunk: unknown) => Iterable<{ resource?: string }> | undefined } }).chunkGraph as any,
          compilerOptions.cssMatcher,
          (resource, issuer) => resolveWebpackCssAssetModuleResource(resource, issuer, {
            appType,
            cssMatcher: compilerOptions.cssMatcher,
          }),
        )
        const watchChangedFiles = new Set([...getWatchChangedFiles?.() ?? []].map(file => path.resolve(file)))
        const recordedChanges = getCompilationChangeRecord?.()
        const compilationChanges = recordedChanges?.changes ?? createCompilationDependencyChanges(watchChangedFiles)
        const affectedCompilationScopes = recordedChanges?.affectedScopes ?? recordCompilationDependencyChanges(runtimeState, compilationChanges)
        const getCompilationDependencyRevision = (scopeId: string) => getCompilationScopeDependencyRevision(runtimeState, scopeId)
        const taskConcurrency = watchMode ? resolveTaskConcurrency(1) : undefined
        const activeProcessCacheKeys = new Set<string>()
        const activeProcessHashKeys = new Set<string | number>()
        const rememberProcessCacheKey = (cacheKey: string, hashKey: string | number = cacheKey) => {
          activeProcessCacheKeys.add(cacheKey)
          activeProcessHashKeys.add(hashKey)
        }
        const activeWebpackAssetResourceFiles = new Set(
          [...cssAssetResources.values()].flatMap(resources => [...resources].map(resource => path.resolve(resource))),
        )
        const registeredWebpackCssSourceFiles = prepareWebpackCssSources?.(activeWebpackAssetResourceFiles) ?? new Set<string>()
        for (const chunk of compilation.chunks) {
          if (chunk.id) {
            activeProcessHashKeys.add(chunk.id)
          }
        }
        const cssSources = new Map(
          [...(getWebpackCssSources?.() ?? [])]
            .map(([file, source]) => [path.resolve(file), source] as const),
        )
        const generatedCssSources = new Map(
          [...(getWebpackGeneratedCssSources?.() ?? [])]
            .map(([file, source]) => [path.resolve(file), source] as const),
        )
        const {
          activeWebpackCssSourceFiles,
          configuredCssEntryFiles,
          configuredMainCssEntryFiles,
          getCssHandlerOptions,
          getCssUserHandlerOptions,
          hasConfiguredTailwindV4SourceRoots,
          isSameWebpackSourceScope,
          resolveWebpackCssSourceFile,
        } = createWebpackCssSourceResolvers({
          activeWebpackAssetResourceFiles,
          appType,
          compilerOptions,
          compilation: compilation as any,
          cssAssetFiles: entries.map(([file]) => file),
          cssAssetResources,
          directCssAssetResources,
          cssHandlerOptionsCache,
          cssSources,
          cssUserHandlerOptionsCache,
          groupedCssEntriesLength: groupedEntries.css.length,
          singleCssAssetFile: groupedEntries.css[0]?.[0],
          isWebGeneratorTarget,
          outputDir,
          runtimeState,
        })
        const finalizeCssAssetSource = (source: string, options: { cssPreflight?: boolean | undefined, generatedCss?: boolean, preserveExistingPreflight?: boolean | undefined } = {}) =>
          finalizeWebpackCssAssetSource(source, compilerOptions, isWebGeneratorTarget, options)
        const shouldRefreshWebpackSourceCandidates = (!isWebGeneratorTarget && groupedEntries.css.length > 0)
          || cssSources.size > 0
          || generatedCssSources.size > 0
          || isCssSourceTraceEnabled(compilerOptions)
        recordTimingDetail('setup', setupStartedAt)
        const sourceCandidatesStartedAt = performance.now()
        const webpackSourceCandidates = shouldRefreshWebpackSourceCandidates
          ? await refreshWebpackSourceCandidates({
              compilerOptions,
              debug,
              outputDir,
              runtimeState,
              scanCache: webpackSourceCandidateScanCache,
              watchChangedFiles,
              watchMode,
            })
          : undefined
        const webpackSourceCandidateValueSignature = webpackSourceCandidates
          ? createCandidateSignature(webpackSourceCandidates.getSourceCandidatesForEntries(undefined))
          : 'source-candidates:0'
        recordTimingDetail('sourceCandidates', sourceCandidatesStartedAt)
        const cssSourceTraceTokenSources = createWebpackCssSourceTraceTokenSources(compilerOptions, webpackSourceCandidates)
        const cssSourceTraceSignature = createCssSourceTraceCacheSignature(cssSourceTraceTokenSources, compilerOptions)
        const annotateCss = (css: string) => annotateCssSourceTrace(css, {
          opts: compilerOptions,
          tokenSources: cssSourceTraceTokenSources,
        })
        const finalizeTracedCss = (
          css: string,
          cssHandlerOptions: WebpackCssHandlerOptions,
          options: { finalized?: boolean | undefined } = {},
        ) =>
          finalizeTracedWebpackCssAsset(css, cssHandlerOptions, {
            annotateCss,
            compilerOptions,
            ...options,
            isWebGeneratorTarget,
          })
        const hasRuntimeTransformAssets = Boolean(
          !isWebGeneratorTarget
          && ((groupedEntries.html?.length ?? 0) > 0 || (groupedEntries.js?.length ?? 0) > 0),
        )
        const runtimeStartedAt = performance.now()
        const forceRuntimeRefresh = getRuntimeRefreshRequirement()
        debug('processAssets ensure runtime set forceRefresh=%s major=%s', forceRuntimeRefresh, runtimeState.tailwindRuntime.majorVersion ?? 'unknown')
        let runtimeSet: Set<string>
        let runtimeAffectingSourceHash = 'runtime-affecting:0'
        if (isWebGeneratorTarget && !hasRuntimeTransformAssets && !forceRuntimeRefresh) {
          runtimeSet = getRuntimeClassSetSync(runtimeState.tailwindRuntime)
        }
        else if (watchMode && !forceRuntimeRefresh) {
          const baseRuntimeSet = getRuntimeClassSetSync(runtimeState.tailwindRuntime)
          const snapshot = buildWebpackBundleSnapshot(assets as any, compilerOptions, bundleBuildState, compilation as any)
          if (bundleBuildState.iteration === 0) {
            for (const entry of snapshot.entries) {
              snapshot.runtimeAffectingChangedByType[entry.type].add(entry.file)
            }
          }
          runtimeAffectingSourceHash = createRuntimeCompilationAffectingSignature(
            snapshot,
            source => compilerOptions.cache.computeHash(source),
          )
          try {
            runtimeSet = await bundleRuntimeClassSetManager.sync(runtimeState.tailwindRuntime, snapshot, {
              baseClassSet: baseRuntimeSet,
              skipInitialFullScanWithBase: false,
            })
          }
          catch (error) {
            debug('webpack incremental runtime set sync failed, fallback to full collect: %O', error)
            await bundleRuntimeClassSetManager.reset()
            runtimeSet = getRuntimeClassSetSync(runtimeState.tailwindRuntime)
          }
          releaseWebpackBundleSnapshotSources(snapshot)
          updateRuntimeCompilationBuildState(bundleBuildState, snapshot, new Map(), { incremental: true })
        }
        else {
          if (forceRuntimeRefresh) {
            await bundleRuntimeClassSetManager.reset()
            resetRuntimeCompilationBuildState(bundleBuildState)
          }
          runtimeSet = await ensureRuntimeClassSet(runtimeState, {
            forceRefresh: forceRuntimeRefresh,
            // In watch mode the runtime-classset loader may have already
            // refreshed the class set for this compilation. Reuse that cached
            // result unless webpack reported a runtime dependency change;
            // otherwise webpack can do a second full content scan in
            // processAssets for the same rebuild.
            forceCollect: !watchMode || forceRuntimeRefresh,
            clearCache: forceRuntimeRefresh,
            allowEmpty: false,
          })
        }
        await refreshRuntimeMetadata(forceRuntimeRefresh)
        consumeRuntimeRefreshRequirement()
        recordTimingDetail('runtime', runtimeStartedAt)
        const webpackSourceCandidateSet = webpackSourceCandidates?.getSourceCandidatesForEntries(undefined)
        const generatorRuntimeSet = new Set(runtimeSet)
        addRuntimeTransformCandidates(generatorRuntimeSet, webpackSourceCandidateSet)
        const transformRuntimeSet = new Set(runtimeSet)
        if (hasRuntimeTransformAssets) {
          for (const [, originalSource] of groupedEntries.css) {
            for (const candidate of collectGeneratedCssRuntimeCandidates(originalSource.source().toString())) {
              transformRuntimeSet.add(candidate)
            }
          }
        }
        const transformedJsRuntimeCandidates = new Set<string>()
        let currentJsRuntimeCandidates: Set<string> | undefined
        let currentJsRuntimeTokenSignature: string | undefined
        const getWebpackAssetSource = (file: string): WebpackSourceLike | undefined => {
          const asset = compilation.getAsset(file)
          return asset?.source as WebpackSourceLike | undefined
        }
        const getCurrentJsRuntimeCandidates = () => {
          if (currentJsRuntimeCandidates) {
            return currentJsRuntimeCandidates
          }
          currentJsRuntimeCandidates = collectWebpackJsRuntimeCandidatesFromAssets({
            escapeFragments,
            getAssetSource: getWebpackAssetSource,
            isWebGeneratorTarget,
            jsAssets: jsAssets.values(),
          })
          return currentJsRuntimeCandidates
        }
        const getCurrentJsRuntimeTokenSignature = () => {
          if (currentJsRuntimeTokenSignature !== undefined) {
            return currentJsRuntimeTokenSignature
          }
          currentJsRuntimeTokenSignature = collectWebpackJsRuntimeTokenSignature({
            getAssetSource: getWebpackAssetSource,
            isWebGeneratorTarget,
            jsAssets: jsAssets.values(),
          })
          return currentJsRuntimeTokenSignature
        }
        const rememberTransformedRuntimeCandidates = (source: WebpackSourceLike) => {
          currentJsRuntimeCandidates = undefined
          currentJsRuntimeTokenSignature = undefined
          const code = stringifyWebpackSourceLike(source)
          for (const candidate of collectStrictEscapedRuntimeCandidates(code, MappingChars2String, escapeFragments)) {
            if (isRuntimeTransformCandidate(candidate)) {
              transformedJsRuntimeCandidates.add(candidate)
            }
          }
        }
        const createRuntimeSetHash = (generatorRuntimeSet: Set<string>) => compilerOptions.cache.computeHash([
          getRuntimeClassSetSignature(runtimeState.tailwindRuntime),
          [...runtimeSet].sort().join('\n'),
          [...transformRuntimeSet].sort().join('\n'),
          [...generatorRuntimeSet].sort().join('\n'),
          getCurrentJsRuntimeTokenSignature(),
        ].join('\n\n'))
        const getGeneratorRuntimeSet = () => {
          const currentJsCandidates = getCurrentJsRuntimeCandidates()
          if (transformedJsRuntimeCandidates.size === 0 && (!currentJsCandidates || currentJsCandidates.size === 0)) {
            return generatorRuntimeSet
          }
          const nextRuntimeSet = new Set(generatorRuntimeSet)
          for (const candidate of currentJsCandidates!) {
            nextRuntimeSet.add(candidate)
          }
          for (const candidate of transformedJsRuntimeCandidates) {
            nextRuntimeSet.add(candidate)
          }
          return nextRuntimeSet
        }
        const defaultTemplateHandlerOptions = {
          runtimeSet: transformRuntimeSet,
        }
        debug('get runtimeSet, class count: %d, transform class count: %d', runtimeSet.size, transformRuntimeSet.size)
        const tasks: Promise<void>[] = []
        const cssTaskFactories: Array<() => Promise<void>> = []
        const enqueueTask = async (
          factory: () => Promise<void>,
          target: Array<() => Promise<void>>,
          phase: string,
        ) => {
          const timedFactory = async () => {
            const startedAt = performance.now()
            try {
              await factory()
            }
            finally {
              recordTimingDetail(phase, startedAt)
            }
          }
          if (watchMode) {
            await timedFactory()
            return
          }
          target.push(timedFactory)
        }
        const { htmlTaskFactories, jsTaskFactories } = await enqueueWebpackHtmlAndJsTasks({
          ConcatSource,
          applyWebpackLinkedJsResults,
          assetHashByChunk,
          compilation,
          compilerOptions,
          debug,
          defaultTemplateHandlerOptions,
          enqueueTask,
          groupedEntries,
          isWebGeneratorTarget,
          jsAssets,
          moduleGraphOptions,
          outputDir,
          rememberProcessCacheKey,
          rememberTransformedRuntimeCandidates,
          runtimeState,
          transformRuntimeSet,
          updateAssetIfChanged,
          watchMode,
        })
        const cssTaskContext = { ConcatSource, affectedCompilationScopes, assetHashByChunk, compilation, compilationChanges, compilerOptions, configuredCssEntryFiles, configuredMainCssEntryFiles, createRuntimeSetHash, cssSourceTraceSignature, cssSources, cssTaskFactories, debug, enqueueTask, finalizeCssAssetSource, finalizeTracedCss, generatedCssSources, generatorRuntimeSet, getCompilationDependencyRevision, getCssHandlerOptions, getCssUserHandlerOptions, getGeneratorRuntimeSet, hasConfiguredTailwindV4SourceRoots, isKnownWebpackProcessedCssAsset, isSameWebpackSourceScope, isWebGeneratorTarget, isWebpackProcessedCssAsset, processedCssAssetSkipDecisionCache, rememberProcessCacheKey, resolveWebpackCssSourceFile, runtimeAffectingSourceHash, runtimeState, transformRuntimeSet, updateAssetIfChanged, watchMode, webpackSourceCandidateSet, webpackSourceCandidateValueSignature, webpackSourceCandidates }
        for (const element of groupedEntries.css) {
          if (await processWebpackProcessedCssAsset(element, cssTaskContext)) {
            continue
          }
          await processWebpackGeneratedCssAsset(element, cssTaskContext)
        }
        await finalizeWebpackProcessAssets({
          activeProcessCacheKeys,
          activeProcessHashKeys,
          activeWebpackCssSourceFiles,
          compilerOptions,
          cssAssetResources,
          cssHandlerOptionsCache,
          cssTaskFactories,
          cssUserHandlerOptionsCache,
          debug,
          entries,
          groupedEntries,
          hmrTimingStartedAt,
          htmlTaskFactories,
          jsTaskFactories,
          pruneWebpackCssSources,
          recordTimingDetail,
          registeredWebpackCssSourceFiles,
          taskConcurrency,
          tasks,
          timingDetails,
          watchMode,
          webpackSourceCandidateScanCache,
        })
        finalizeCompilerShadowRun(runtimeState)
      },
    )
    if (!isWebGeneratorTarget) {
      compilation.hooks.processAssets.tapPromise(
        {
          name: `${pluginName}:finalize-css-assets`,
          stage: Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_HASH,
        },
        async (assets) => {
          const entries = Object.entries(assets)
          if (entries.length === 0) {
            return
          }
          const groupedEntries = getGroupedEntries(entries, compilerOptions)
          if (groupedEntries.css.length === 0) {
            return
          }
          const { updateAssetIfChanged } = createWebpackAssetUpdater({
            compilation,
            ConcatSource,
            onUpdate: compilerOptions.onUpdate,
            debug,
          })
          for (const [file, asset] of groupedEntries.css) {
            const currentAsset = compilation.getAsset(file)
            const rawSource = currentAsset?.source.source() ?? asset.source()
            const source = rawSource.toString()
            const finalized = finalizeWebpackCssAssetOutputSource(source, compilerOptions, isWebGeneratorTarget)
            updateAssetIfChanged(file, finalized)
            warnFinalRpxThemeRisk(runtimeState, [finalized], compilerOptions)
          }
        },
      )
    }
  })
}
