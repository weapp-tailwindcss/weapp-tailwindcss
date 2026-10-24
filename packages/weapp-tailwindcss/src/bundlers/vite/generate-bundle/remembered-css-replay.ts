import type { OutputAsset, OutputChunk } from 'rollup'
import type { ViteFrameworkCssPipelineContext, ViteFrameworkCssPipelineStrategy } from '../shared/framework-strategy'
import type { BundleMetrics } from './metrics'
import type { GenerateBundleContext, PendingRememberedCssReplayUpdate, RememberedCssSource } from './types'
import { sourcePathApi } from '@weapp-tailwindcss/source-scan'
import { AssetEmissionPlan, getCompilationScopeDependencyRevision } from '@/compiler'
import { generateTailwindV4Css } from '@/context/generation'
import { isPureLocalCssImportWrapper } from '../../../generation/local-imports'
import { normalizeMiniProgramGeneratorCssSource, normalizeMiniProgramImportShell } from '../../../generation/output-import-shell'
import { isSourcePreprocessorRequest } from '../../../generation/style-requests'
import { annotateCssSourceTrace, createCssTokenSourceMap, isCssSourceTraceEnabled } from '../../shared/css-source-trace'
import { normalizeOutputPathKey } from '../../shared/module-graph'
import { canProcessViteSourceStyleAsCss, SOURCE_STYLE_OUTPUT_EXT_RE } from '../css-output'
import { createRuntimeAffectingSourceSignature } from '../runtime-affecting-signature'
import { isHTMLRequest } from '../utils'
import { applyViteAssetEmissionPlan } from './asset-emission-plan'
import { selectUnbundledCssReplaySources } from './bundled-css-sources'
import { createCssRuntimeSignature } from './css-share-scope'
import { measureElapsed } from './metrics'
import { collectRememberedCssReplayGroups, createGeneratedReplayCacheKey, createGeneratedReplayCacheProof, createGeneratedReplayCacheSignature, createRememberedCssRuntimeSignature, getGeneratedReplayCache, mergeRememberedCssSources } from './remembered-css'
import { registerGeneratorDependencies } from './rollup-assets'
import { isRootMiniProgramStyleOutputFile, shouldPreserveFrameworkRootMiniProgramImportShell } from './root-style-output'
import { createScopedGeneratorCandidateSignature, createScopedGeneratorSourceTraceMap } from './scoped-generator'
import { hasScopedSourceDirectives } from './scoped-generator-sources'
import { createCandidateSignature } from './signatures'
import { createMergedCssSourceTraceMap } from './source-trace'
import { rememberLastCssResult } from './vite-css-cache'

function dedupeRememberedCssReplayGroup(
  group: Array<{ key: string, remembered: RememberedCssSource }>,
) {
  const bySourceAndOutput = new Map<string, { key: string, remembered: RememberedCssSource }>()
  for (const item of group) {
    const sourceKey = `${normalizeOutputPathKey(item.remembered.sourceFile)}\0${normalizeOutputPathKey(item.remembered.outputFile)}`
    bySourceAndOutput.set(sourceKey, item)
  }
  return [...bySourceAndOutput.values()]
}

interface ProcessRememberedCssReplayOptions {
  addWatchFile: (id: string) => void
  bundle: Record<string, OutputAsset | OutputChunk>
  bundleFiles: string[]
  cache: GenerateBundleContext['opts']['cache']
  changedCssFiles: Set<string>
  createScopedGeneratorRuntime: (
    outputFile: string,
    cssHandlerOptions: { isMainChunk?: boolean | undefined },
    runtime: Set<string>,
    rawSource?: string | undefined,
    sourceFile?: string | undefined,
    scopeToSource?: boolean | undefined,
  ) => Promise<Set<string>>
  createScopedSourceCandidateGetter: (
    outputFile: string,
    cssHandlerOptions: { isMainChunk?: boolean | undefined },
    sourceFile?: string | undefined,
  ) => GenerateBundleContext['getSourceCandidatesForEntries']
  createScopedSourceCandidateSourceGetter: (
    outputFile: string,
    cssHandlerOptions: { isMainChunk?: boolean | undefined },
    sourceFile?: string | undefined,
  ) => GenerateBundleContext['getSourceCandidateSourcesForEntries']
  cssTaskFactories: Array<() => Promise<void>>
  cssPipelineContext: ViteFrameworkCssPipelineContext
  cssPipelineStrategy?: ViteFrameworkCssPipelineStrategy | undefined
  debug: GenerateBundleContext['debug']
  defaultStyleOutputExtension: string
  emitOrReplayCssAsset: (fileName: string, source: string) => OutputAsset | undefined
  generatorRuntime: Set<string>
  generatorPlatform?: string | undefined
  getCssHandlerOptions: (file: string) => ReturnType<ReturnType<typeof import('../css-handler-options').createCssHandlerOptionsCache>['getCssHandlerOptions']>
  getCssUserHandlerOptions: (file: string) => ReturnType<ReturnType<typeof import('../css-handler-options').createCssHandlerOptionsCache>['getCssUserHandlerOptions']>
  getRememberedCssSignature?: ((file: string) => string | undefined) | undefined
  getRememberedCssSources?: (() => Iterable<[string, RememberedCssSource]>) | undefined
  frameworkRootImportShellTargetByFile?: ReadonlyMap<string, string> | undefined
  isNativeAppStyleTarget: boolean
  isWebGeneratorTarget: boolean
  lastCssRawSourceHashByFile: Map<string, string>
  lastCssResultByFile: Map<string, string>
  lastCssSourceHashByFile: Map<string, string>
  markCssAssetProcessed: GenerateBundleContext['markCssAssetProcessed']
  metrics: BundleMetrics
  normalizeViteCssCacheKey: (file: string) => string
  onUpdate: GenerateBundleContext['opts']['onUpdate']
  opts: GenerateBundleContext['opts']
  pendingRememberedCssReplayUpdates: PendingRememberedCssReplayUpdate[]
  recordCssAssetResult: GenerateBundleContext['recordCssAssetResult']
  recordViteProcessedCssAssetResult: GenerateBundleContext['recordViteProcessedCssAssetResult']
  rootDir: string
  runtimeSignature: string
  runtimeState: GenerateBundleContext['runtimeState']
  setRememberedCssSignature?: ((file: string, cssRuntimeSignature: string) => void) | undefined
  shouldInjectCssIntoMainFromOutput: (
    outputFile: string,
    sourceFile: string,
    cssHandlerOptions: { isMainChunk?: boolean | undefined },
  ) => boolean
  shouldPreserveAppCssExtension: boolean
  sourceRoot: string | undefined
  styleHandler: GenerateBundleContext['opts']['styleHandler']
  timeTask: (name: string, task: () => Promise<void>) => Promise<void>
  useIncrementalMode: boolean
  activeViteCssCacheFiles: Set<string>
}

export function shouldSkipRawRememberedCssSource(rawSource: string, sourceFile: string) {
  const cleanSourceFile = sourceFile.replace(/[?#].*$/, '')
  return (SOURCE_STYLE_OUTPUT_EXT_RE.test(cleanSourceFile) || isSourcePreprocessorRequest(sourceFile))
    && !canProcessViteSourceStyleAsCss(rawSource, sourceFile)
}

export function resolveRememberedCssReplayOutputFile(
  outputFile: string,
  targetByFile: ReadonlyMap<string, string> | undefined,
) {
  const outputKey = normalizeOutputPathKey(outputFile)
  for (const [shellFile, targetFile] of targetByFile ?? []) {
    if (normalizeOutputPathKey(shellFile) === outputKey) {
      return targetFile
    }
  }
  return outputFile
}

function createRememberedCssReplayUpdates(
  css: string,
  sourceFile: string,
  outputFile: string,
  injectIntoMain: boolean,
): PendingRememberedCssReplayUpdate[] {
  const updates: PendingRememberedCssReplayUpdate[] = [{
    css,
    file: sourceFile,
    injectIntoMain,
    outputFile,
  }]
  if (outputFile !== sourceFile) {
    updates.push({
      css,
      file: outputFile,
      injectIntoMain,
      outputFile,
    })
  }
  return updates
}

export async function processRememberedCssReplay(options: ProcessRememberedCssReplayOptions) {
  const {
    addWatchFile,
    activeViteCssCacheFiles,
    bundle,
    bundleFiles,
    cache,
    changedCssFiles = new Set<string>(),
    createScopedGeneratorRuntime,
    createScopedSourceCandidateGetter,
    createScopedSourceCandidateSourceGetter,
    cssTaskFactories,
    cssPipelineStrategy,
    debug,
    defaultStyleOutputExtension,
    emitOrReplayCssAsset,
    generatorRuntime,
    generatorPlatform,
    getCssHandlerOptions,
    getCssUserHandlerOptions,
    getRememberedCssSignature,
    getRememberedCssSources,
    frameworkRootImportShellTargetByFile,
    isNativeAppStyleTarget,
    isWebGeneratorTarget,
    lastCssRawSourceHashByFile = new Map<string, string>(),
    lastCssResultByFile,
    lastCssSourceHashByFile,
    markCssAssetProcessed,
    metrics,
    normalizeViteCssCacheKey,
    onUpdate,
    opts,
    pendingRememberedCssReplayUpdates,
    recordCssAssetResult,
    recordViteProcessedCssAssetResult,
    rootDir,
    runtimeSignature,
    runtimeState,
    setRememberedCssSignature,
    shouldInjectCssIntoMainFromOutput,
    shouldPreserveAppCssExtension,
    sourceRoot,
    styleHandler,
    timeTask,
    useIncrementalMode,
  } = options
  const rememberedReplayGroups = collectRememberedCssReplayGroups(
    selectUnbundledCssReplaySources(getRememberedCssSources?.(), bundle, (sourceFile) => {
      activeViteCssCacheFiles.add(normalizeViteCssCacheKey(sourceFile))
    }),
    opts,
    rootDir,
    isWebGeneratorTarget,
    shouldPreserveAppCssExtension,
    sourceRoot,
    defaultStyleOutputExtension,
    bundleFiles,
  )
  const normalizedBundleFiles = new Set(bundleFiles.map(normalizeOutputPathKey))
  for (const [rememberedOutputFile, rememberedGroup] of rememberedReplayGroups) {
    const outputFile = resolveRememberedCssReplayOutputFile(
      rememberedOutputFile,
      frameworkRootImportShellTargetByFile,
    )
    if (outputFile !== rememberedOutputFile) {
      debug('css replay use framework root import shell target: %s -> %s', rememberedOutputFile, outputFile)
    }
    if (isHTMLRequest(outputFile) || options.opts.htmlMatcher(outputFile)) {
      continue
    }
    const replayableRememberedGroup = (rememberedGroup.length > 1 ? dedupeRememberedCssReplayGroup(rememberedGroup) : rememberedGroup).filter(({ remembered }) => {
      const shouldSkip = shouldSkipRawRememberedCssSource(remembered.rawSource, remembered.sourceFile)
      if (shouldSkip) {
        debug('css replay skip raw source style: %s -> %s', remembered.sourceFile, outputFile)
      }
      return !shouldSkip
    })
    const rememberedKeys = replayableRememberedGroup.map(item => item.key)
    const rememberedCssSource = mergeRememberedCssSources(
      replayableRememberedGroup.map(item => item.remembered),
      outputFile,
    )
    if (!rememberedCssSource) {
      continue
    }
    const { sourceFile } = rememberedCssSource
    // 异步 CSS 任务尚未写入 bundle 时，本轮输出计划也拥有该目标，不能再排入旧回放。
    if (
      activeViteCssCacheFiles.has(`planned:${normalizeViteCssCacheKey?.(outputFile) ?? normalizeOutputPathKey(outputFile)}`)
      || normalizedBundleFiles.has(normalizeOutputPathKey(rememberedOutputFile))
      || normalizedBundleFiles.has(normalizeOutputPathKey(sourceFile))
      || bundleFiles.includes(rememberedOutputFile)
      || bundleFiles.includes(sourceFile)
    ) {
      continue
    }
    const rawSource = isWebGeneratorTarget
      ? rememberedCssSource.rawSource
      : normalizeMiniProgramImportShell(rememberedCssSource.rawSource, {
          cssOnly: true,
          outputFile,
          outputFiles: [...bundleFiles, ...lastCssResultByFile.keys()],
        })
    const generatorRawSource = isWebGeneratorTarget
      ? rawSource
      : normalizeMiniProgramGeneratorCssSource(rawSource, outputFile, [...bundleFiles, ...lastCssResultByFile.keys()])
    activeViteCssCacheFiles.add(normalizeViteCssCacheKey(outputFile))
    activeViteCssCacheFiles.add(normalizeViteCssCacheKey(sourceFile))
    const outputCssHandlerOptions = getCssHandlerOptions(rememberedOutputFile)
    const ownedSources = replayableRememberedGroup.map(item => item.remembered)
    const hasScopedSources = hasScopedSourceDirectives(ownedSources)
    const cssHandlerOptions = {
      ...getCssHandlerOptions(sourceFile),
      isMainChunk: outputCssHandlerOptions.isMainChunk,
      ...(hasScopedSources
        ? { sourceOptions: {
            ...getCssHandlerOptions(sourceFile).sourceOptions,
            cssEntries: ownedSources.map(source => source.sourceFile),
            cssSources: ownedSources.map(source => ({ file: source.sourceFile, base: sourcePathApi(source.sourceFile).dirname(source.sourceFile), css: source.rawSource })),
          } }
        : {}),
    }
    const scopedSourceCandidateGetter = createScopedSourceCandidateGetter(outputFile, cssHandlerOptions, sourceFile)
    const scopedSourceCandidateSourceGetter = createScopedSourceCandidateSourceGetter(outputFile, cssHandlerOptions, sourceFile)
    const signatureSources = hasScopedSources ? ownedSources : [{ rawSource: generatorRawSource, sourceFile }]
    const scopedGeneratorRuntime = hasScopedSources
      ? new Set((await Promise.all(signatureSources.map(source =>
          createScopedGeneratorRuntime(outputFile, cssHandlerOptions, generatorRuntime, source.rawSource, source.sourceFile, true),
        ))).flatMap(candidates => [...candidates]))
      : await createScopedGeneratorRuntime(outputFile, cssHandlerOptions, generatorRuntime, generatorRawSource, sourceFile)
    const candidateSignatures = hasScopedSources
      ? await Promise.all(signatureSources.map(async source => [
          source.sourceFile,
          await createScopedGeneratorCandidateSignature(source.rawSource, source.sourceFile, createCandidateSignature(scopedGeneratorRuntime), scopedSourceCandidateGetter, {
            includeFallbackSignature: cssHandlerOptions.isMainChunk,
            majorVersion: runtimeState.tailwindRuntime.majorVersion,
            scopeToSource: true,
          }),
        ]))
      : undefined
    const scopedGeneratorCandidateSignature = hasScopedSources
      ? JSON.stringify(candidateSignatures)
      : await createScopedGeneratorCandidateSignature(
          generatorRawSource,
          sourceFile,
          createCandidateSignature(scopedGeneratorRuntime),
          scopedSourceCandidateGetter,
          {
            includeFallbackSignature: cssHandlerOptions.isMainChunk,
            majorVersion: runtimeState.tailwindRuntime.majorVersion,
          },
        )
    const cssRuntimeSignature = createCssRuntimeSignature(
      createCandidateSignature(scopedGeneratorRuntime),
      scopedGeneratorCandidateSignature,
    )
    const cssRuntimeAffectingHash = cache.computeHash(createRuntimeAffectingSourceSignature(rawSource, 'css'))
    const rememberedCssRuntimeSignature = createRememberedCssRuntimeSignature(cssRuntimeSignature, cssRuntimeAffectingHash)
    const rawSourceHash = cache.computeHash(rawSource)
    const previousRawSourceHash = lastCssRawSourceHashByFile.get(outputFile)
    const cssSourceChanged = changedCssFiles.has(outputFile)
      || changedCssFiles.has(sourceFile)
      || (previousRawSourceHash != null && previousRawSourceHash !== rawSourceHash)
    const allRememberedSignaturesFresh = rememberedKeys.length > 0
      && rememberedKeys.every(key => getRememberedCssSignature?.(key) === rememberedCssRuntimeSignature)
    const hasCurrentFrameworkContribution = [...frameworkRootImportShellTargetByFile ?? []].some(([file, target]) =>
      normalizeOutputPathKey(target) === normalizeOutputPathKey(outputFile)
      && normalizedBundleFiles.has(normalizeOutputPathKey(file)),
    )
    const shouldMergeReplayIntoFrameworkRootTarget = hasCurrentFrameworkContribution
      || (outputFile !== rememberedOutputFile
        && normalizedBundleFiles.has(normalizeOutputPathKey(outputFile)))
    const generatedReplayKey = createGeneratedReplayCacheKey(outputFile)
    activeViteCssCacheFiles.add(generatedReplayKey)
    const generatedReplaySignature = createGeneratedReplayCacheSignature({
      outputFile,
      rememberedOutputFile,
      sources: ownedSources,
      computeHash: source => cache.computeHash(source),
      rawSource,
      generatorRawSource,
      rememberedSignature: rememberedCssRuntimeSignature,
      runtimeSignature,
      dependencyRevision: getCompilationScopeDependencyRevision(runtimeState, outputFile),
      generatorPlatform,
      isMainChunk: cssHandlerOptions.isMainChunk,
    })
    // 签名新鲜只能省略生成；缺席的资产仍必须提交到本轮构建图。
    // 通用产物缓存可能包含框架贡献，只能回放有完整归属证明的干净生成结果。
    const cachedGeneratedReplay = allRememberedSignaturesFresh && !cssSourceChanged
      ? getGeneratedReplayCache(lastCssResultByFile, lastCssSourceHashByFile, generatedReplayKey, generatedReplaySignature)
      : undefined
    const sourceTraceSources = isCssSourceTraceEnabled(opts) && scopedSourceCandidateSourceGetter
      ? hasScopedSources
        ? await createMergedCssSourceTraceMap(signatureSources, source => createScopedGeneratorSourceTraceMap(source.rawSource, source.sourceFile, scopedSourceCandidateSourceGetter, { scopeToSource: true }))
        : await createScopedGeneratorSourceTraceMap(generatorRawSource, sourceFile, scopedSourceCandidateSourceGetter)
      : undefined
    const sourceTraceTokenSources = sourceTraceSources
      ? createCssTokenSourceMap(sourceTraceSources, opts)
      : undefined
    const annotateCss = (css: string) => annotateCssSourceTrace(css, {
      opts,
      tokenSources: sourceTraceTokenSources,
    })
    const shouldRecordRememberedReplayCss = useIncrementalMode || isNativeAppStyleTarget
    const shouldEmitRememberedReplayCssAsset = shouldRecordRememberedReplayCss
      && !shouldMergeReplayIntoFrameworkRootTarget
    if (!shouldRecordRememberedReplayCss) {
      continue
    }
    const shouldPreserveFrameworkRootImportShell = shouldPreserveFrameworkRootMiniProgramImportShell({
      css: rawSource,
      file: outputFile,
      isWebGeneratorTarget,
      matchesCss: opts.cssMatcher(outputFile),
      shouldKeep: () => (cssPipelineStrategy?.styles?.rootImportShell !== undefined),
    })
    const shouldPreserveLocalImportWrapper = shouldPreserveFrameworkRootImportShell
      || (!isRootMiniProgramStyleOutputFile(outputFile) && !isWebGeneratorTarget && isPureLocalCssImportWrapper(rawSource))
    const emitRememberedCssAsset = (css: string) => {
      const plan = new AssetEmissionPlan()
      let replayAsset: OutputAsset | undefined
      plan.write(outputFile, css)
      applyViteAssetEmissionPlan(plan, {
        bundle,
        emitOrReplayAsset(file, source) {
          replayAsset = emitOrReplayCssAsset(file, source)
          return replayAsset
        },
      })
      if (replayAsset) {
        markCssAssetProcessed?.(replayAsset, outputFile)
      }
    }
    if (shouldPreserveLocalImportWrapper) {
      cssTaskFactories.push(() => timeTask('css.replay', async () => {
        const start = performance.now()
        const css = annotateCss(normalizeMiniProgramImportShell(rawSource))
        lastCssRawSourceHashByFile.set(outputFile, rawSourceHash)
        rememberLastCssResult(lastCssResultByFile, lastCssSourceHashByFile, outputFile, css, cssRuntimeAffectingHash)
        for (const key of rememberedKeys) {
          setRememberedCssSignature?.(key, rememberedCssRuntimeSignature)
        }
        recordCssAssetResult?.(outputFile, css)
        if (shouldEmitRememberedReplayCssAsset) {
          emitRememberedCssAsset(css)
        }
        metrics.css.elapsed += measureElapsed(start)
        metrics.css.transformed++
        onUpdate(outputFile, rememberedCssSource.rawSource, css)
        debug('css replay preserve local import shell: %s', outputFile)
      }))
      continue
    }
    const recordGeneratedReplayCss = (css: string) => {
      lastCssRawSourceHashByFile.set(outputFile, rawSourceHash)
      rememberLastCssResult(lastCssResultByFile, lastCssSourceHashByFile, outputFile, css, cssRuntimeAffectingHash)
      for (const key of rememberedKeys) {
        setRememberedCssSignature?.(key, rememberedCssRuntimeSignature)
      }
      recordCssAssetResult?.(outputFile, css)
      const injectIntoMain = shouldMergeReplayIntoFrameworkRootTarget
        ? true
        : outputCssHandlerOptions.isMainChunk
          ? false
          : shouldInjectCssIntoMainFromOutput(outputFile, sourceFile, outputCssHandlerOptions)
      const replayUpdates = createRememberedCssReplayUpdates(css, sourceFile, outputFile, injectIntoMain)
      if (shouldMergeReplayIntoFrameworkRootTarget) {
        pendingRememberedCssReplayUpdates.push(...replayUpdates)
      }
      else {
        for (const update of replayUpdates) {
          recordViteProcessedCssAssetResult?.(update.file, update.css, update)
        }
      }
      if (shouldEmitRememberedReplayCssAsset) {
        emitRememberedCssAsset(css)
      }
    }
    if (cachedGeneratedReplay !== undefined) {
      cssTaskFactories.push(() => timeTask('css.replay', async () => {
        const start = performance.now()
        const css = annotateCss(cachedGeneratedReplay.css)
        registerGeneratorDependencies({ addWatchFile }, cachedGeneratedReplay.dependencies)
        recordGeneratedReplayCss(css)
        metrics.css.elapsed += measureElapsed(start)
        metrics.css.cacheHits++
        onUpdate(outputFile, rememberedCssSource.rawSource, css)
        debug('css replay reuse generated cache: %s bytes=%d', outputFile, cachedGeneratedReplay.css.length)
      }))
      continue
    }
    cssTaskFactories.push(() => timeTask('css.replay', async () => {
      const start = performance.now()
      const generated = await generateTailwindV4Css({
        deferWebCssPropertyFallback: true,
        opts,
        runtimeState,
        runtime: scopedGeneratorRuntime,
        rawSource: generatorRawSource,
        file: sourceFile,
        outputFile,
        cssHandlerOptions,
        cssUserHandlerOptions: getCssUserHandlerOptions(sourceFile),
        cssStage: 'framework-processed',
        getSourceCandidatesForEntries: scopedSourceCandidateGetter,
        generatorPlatform,
        styleHandler,
        debug,
        previousCss: undefined,
      })
      const generatedCss = generated?.css ?? (await styleHandler(generatorRawSource, cssHandlerOptions)).css
      // 注释来源按本轮重新标注，缓存保留未混入框架贡献的原始生成结果。
      rememberLastCssResult(lastCssResultByFile, lastCssSourceHashByFile, generatedReplayKey, generatedCss, createGeneratedReplayCacheProof(generatedReplaySignature, generated?.dependencies))
      const css = annotateCss(generatedCss)
      recordGeneratedReplayCss(css)
      if (generated) {
        registerGeneratorDependencies({ addWatchFile }, generated.dependencies)
        debug('css replay generated result: %s bytes=%d', outputFile, css.length)
      }
      metrics.css.elapsed += measureElapsed(start)
      metrics.css.transformed++
      onUpdate(outputFile, rememberedCssSource.rawSource, css)
      debug('css replay handle: %s', outputFile)
    }))
  }
}
