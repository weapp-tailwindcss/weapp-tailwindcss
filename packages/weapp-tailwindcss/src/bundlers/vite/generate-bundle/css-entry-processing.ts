import type { RememberedCssSource } from './types'
import { readDeferredCssSourceMarkers } from '@weapp-tailwindcss/postcss/transform'
import { normalizeMiniProgramImportShell } from '../../../generation/output-import-shell'
import { processViteCssEntryTransform } from './css-entry-transform'
import { prepareFrameworkRootStyle, preserveFrameworkRootImportShell } from './framework-root-style'

export async function processViteCssBundleEntry(options: any) {
  const {
    activeViteCssCacheFiles,
    applyCssResultToBundle,
    bundle,
    bundleFiles,
    configuredTailwindV4CssSourceFileKeysForScope,
    configuredTailwindV4ExplicitCssEntryFileKeysForScope,
    context,
    createInitialCssPipelineContext,
    debug,
    defaultStyleOutputExtension,
    emitOrReplayCssAsset,
    file,
    frameworkRootImportShellTargetByFile,
    getConfiguredTailwindV4CssSourceEntries,
    getCssHandlerOptions,
    getCssSource,
    getOriginalCssLayerSource,
    getRememberedCssSources,
    getSfcSource,
    getSourceCandidateSources,
    getViteProcessedCssAssetResult,
    getViteProcessedCssAssetResults,
    hasExplicitConfiguredRootCssEntryForOutput,
    hasViteProcessedCssResultForSource,
    isCssAssetProcessed,
    isCssImportOnlyBundleAsset,
    isMiniProgramStyleOutputFile,
    isRootMiniProgramStyleOutputFile,
    isTemporaryCssAssetFile,
    isViteProcessedCssAsset,
    isWebGeneratorTarget,
    lastCssResultByFile,
    markCssAssetProcessed,
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
    recordCssAssetResult,
    resolveAssetSourceFile,
    resolveConfiguredCssEntryRootInjectionTarget,
    resolveConfiguredRootCssSourceStyle,
    resolveCssAssetIdentity,
    resolveCssAssetOutputPlan,
    resolveMatchedCssSourceOutputFile,
    resolveReplayCssOutputFile,
    resolveViteCssCompositionPlan,
    resolveViteCssPipelineOutputFile,
    resolveViteCssSourcePlan,
    rootDir,
    selectConfiguredRootCssSourceEntry,
    shouldGenerateWebCssByGenerator,
    shouldKeepCurrentRootCssOutputForConfiguredSource,
    shouldKeepCurrentRootMiniProgramStyleOutputAsImportShell,
    shouldKeepRootMiniProgramStyleAsImportShell,
    shouldMoveRootMiniProgramStyleToImportShellOrigin,
    shouldPreserveAppCssExtension,
    shouldSkipRawRememberedCssSource,
    shouldSkipRawSourceStyleAsset,
    shouldSkipViteAssetTransform,
    snapshot,
    sourceRoot,
    temporaryCssAssetSourceResolver,
    transformFilter,
    usedConfiguredTailwindV4CssSourceFiles,
  } = options
  metrics.css.total++
  const assetSourceFile = resolveAssetSourceFile(originalSource, file)
  const outputSource = isWebGeneratorTarget
    ? originalEntrySource
    : normalizeMiniProgramImportShell(originalEntrySource, {
        cssOnly: true,
        outputFile: originalSource.fileName || file,
        outputFiles: [...bundleFiles, ...lastCssResultByFile.keys()],
      })
  const rawSource = normalizeRelativeCssConfigDirectives(outputSource, assetSourceFile, outDir, opts)
  const currentRawSourceHasExplicitScanContext = rawSource.includes('@source') || rawSource.includes('@config')
  const cssPipelineContext2 = { ...createInitialCssPipelineContext(file), bundle }
  const rootImportShellOutputFile = resolveReplayCssOutputFile(outDir, originalSource.fileName || file)
  const { rootImportShellPlan, canClaimConfiguredOutput } = prepareFrameworkRootStyle({
    ...options,
    assetSourceFile,
    isWebGeneratorTarget,
    rootImportShellOutputFile,
    rawSource,
    cssPipelineStrategy: context.cssPipelineStrategy,
    pipelineContext: cssPipelineContext2,
    resolveProcessedOutputFile: file => resolveViteCssPipelineOutputFile(file, opts, rootDir, isWebGeneratorTarget, shouldPreserveAppCssExtension, sourceRoot, defaultStyleOutputExtension, bundleFiles),
  })
  if (rootImportShellPlan.isCurrentImportShell && preserveFrameworkRootImportShell({
    ...options,
    assetSourceFile,
    cssPipelineStrategy: context.cssPipelineStrategy,
    outputFile: rootImportShellOutputFile,
    pipelineContext: cssPipelineContext2,
    rootImportShellPlan,
    source: rawSource,
    viteProcessedCssAsset: false,
  })) {
    return
  }
  const cssAssetOutputPlan = resolveCssAssetOutputPlan({
    assetSourceFile,
    bundleFiles,
    configuredEntries: getConfiguredTailwindV4CssSourceEntries(),
    cssPipelineStrategy: context.cssPipelineStrategy,
    defaultStyleOutputExtension,
    file,
    isWebGeneratorTarget,
    normalizeConfiguredSourceFile: normalizeConfiguredTailwindV4CssEntryFileKey,
    opts,
    originalFileNames: originalSource.originalFileNames,
    ownedSourceFiles: readDeferredCssSourceMarkers(rawSource),
    pipelineContext: cssPipelineContext2,
    resolveOutputFileFromMatchedCssSource: resolveMatchedCssSourceOutputFile,
    rootImportShellOutputFile,
    rootImportShellTarget: rootImportShellPlan.isCurrentImportShell ? rootImportShellPlan.targetToRemember : rootImportShellPlan.reusableTarget,
    shouldPreserveAppCssExtension,
    shouldReuseRootImportShell: () => shouldKeepRootMiniProgramStyleAsImportShell(context.cssPipelineStrategy?.shouldKeepRootMiniProgramStyleAsImportShell?.({
      ...cssPipelineContext2,
      css: rawSource,
      file: rootImportShellOutputFile,
    })),
  })
  let outputFile = cssAssetOutputPlan.outputFile
  const resolveMatchedOutputFileForCurrentAsset = (sourceFile: string) => {
    const matched = cssAssetOutputPlan.resolveMatchedOutputFile(sourceFile)
    return matched ? frameworkRootImportShellTargetByFile.get(matched) ?? matched : matched
  }
  const resolvedFromConfiguredOriginalCssEntry = cssAssetOutputPlan.resolvedFromConfiguredOriginalCssEntry
  if (cssAssetOutputPlan.reusedRootImportShellTarget) {
    debug('css reuse framework root import shell target: %s -> %s', rootImportShellOutputFile, outputFile)
  }
  activeViteCssCacheFiles.add(normalizeViteCssCacheKey(outputFile))
  if (shouldSkipRawSourceStyleAsset(outputFile, file, rawSource, assetSourceFile, opts.cssMatcher)) {
    delete bundle[file]
    debug('css skip raw source style asset: %s -> %s', file, outputFile)
    return
  }
  const hasViteProcessedCssRecord = getViteProcessedCssAssetResult?.(file) != null
  const viteProcessedCssAsset = isViteProcessedCssAsset?.(originalSource, file) === true || hasViteProcessedCssRecord
  const cssAssetIdentity = resolveCssAssetIdentity?.(originalSource, file) ?? {
    kind: viteProcessedCssAsset ? 'bundler-generated' : 'user',
  }
  let resolvedFromTemporaryCssAsset = false
  const applyCssResult = (source: string) => {
    applyCssResultToBundle({
      assetSourceFile,
      bundle,
      cssPipelineStrategy: context.cssPipelineStrategy,
      emitOrReplayCssAsset,
      file,
      originalSource,
      outputFile,
      pipelineContext: cssPipelineContext2,
      source,
      viteProcessedCssAsset,
    })
  }
  if (shouldSkipViteAssetTransform(originalSource, file, rootDir, transformFilter)) {
    applyCssResult(rawSource)
    markCssAssetProcessed?.(originalSource, outputFile)
    onUpdate(outputFile, rawSource, rawSource)
    metrics.css.transformed++
    debug('css skip transform (filtered): %s', outputFile)
    return
  }
  if (isWebGeneratorTarget && !shouldGenerateWebCssByGenerator) {
    applyCssResult(rawSource)
    markCssAssetProcessed?.(originalSource, outputFile)
    onUpdate(outputFile, rawSource, rawSource)
    debug('css skip web target: %s', outputFile)
    return
  }
  const alreadyProcessedCssAsset = viteProcessedCssAsset || isCssAssetProcessed?.(originalSource, file) === true
  const configuredTailwindV4CssSourceEntries = getConfiguredTailwindV4CssSourceEntries().filter((entry: { file: string }) => {
    const target = resolveMatchedCssSourceOutputFile(entry.file)
    return canClaimConfiguredOutput(target) && (!rootImportShellPlan.isCurrentImportShell || target === rootImportShellPlan.targetToRemember)
  })
  const normalizedOutputFile = normalizeOutputPathKey(outputFile.replace(/[?#].*$/, ''))
  const isCurrentRootMiniProgramStyleOutput = opts.cssMatcher(outputFile)
    && isMiniProgramStyleOutputFile(outputFile)
    && !normalizedOutputFile.includes('/')
  const cssSourcePlan = await resolveViteCssSourcePlan({
    configuredEntries: configuredTailwindV4CssSourceEntries,
    configuredSourceFileKeys: configuredTailwindV4CssSourceFileKeysForScope,
    cssMatcher: opts.cssMatcher,
    currentRawSourceHasExplicitScanContext,
    cwd: opts.tailwindcssBasedir,
    debug,
    explicitConfiguredSourceFileKeys: configuredTailwindV4ExplicitCssEntryFileKeysForScope,
    file,
    getRememberedCssSources,
    getSfcSource,
    getSourceStyleSource: getCssSource,
    getSourceStyleSources: getSourceCandidateSources,
    hasExplicitConfiguredRootSource: hasExplicitConfiguredRootCssEntryForOutput(outputFile),
    inferenceSourceRoot: sourceRoot,
    isConfiguredSourceProcessed: (sourceFile: string) => hasViteProcessedCssResultForSource(sourceFile, getViteProcessedCssAssetResults),
    isConfiguredSourceUsed: (sourceFile: string) => usedConfiguredTailwindV4CssSourceFiles.has(normalizeOutputPathKey(sourceFile)),
    isCurrentRootMiniProgramStyleOutput,
    normalizeConfiguredSourceFile: normalizeConfiguredTailwindV4CssEntryFileKey,
    originalSource,
    outputFile,
    outputRoot: outDir,
    projectRoot: sourceRoot ?? rootDir,
    rawSource,
    resolveConfiguredRootSource: () => resolveConfiguredRootCssSourceStyle(outputFile, configuredTailwindV4CssSourceEntries, originalSource.originalFileNames),
    resolveMatchedOutputFile: resolveMatchedOutputFileForCurrentAsset,
    resolveTemporarySource: (temporaryOutputFile: string, temporaryRawSource?: string) => temporaryCssAssetSourceResolver.resolve(temporaryOutputFile, temporaryRawSource),
    selectConfiguredRootSource: () => selectConfiguredRootCssSourceEntry(outputFile, configuredTailwindV4CssSourceEntries, originalSource.originalFileNames),
    shouldKeepCurrentRootOutput: shouldKeepCurrentRootCssOutputForConfiguredSource,
    shouldKeepRootImportShell: shouldKeepCurrentRootMiniProgramStyleOutputAsImportShell,
    snapshot,
    sourceRoot: opts.tailwindcssBasedir,
    temporaryOutput: isTemporaryCssAssetFile(outputFile),
  })
  if (rootImportShellPlan.isCurrentImportShell && !cssSourcePlan.hasUsableTailwindSource) {
    return
  }
  outputFile = cssSourcePlan.outputFile
  activeViteCssCacheFiles.add(normalizeViteCssCacheKey(outputFile))
  let outputCssHandlerOptions = getCssHandlerOptions(outputFile)
  if (cssSourcePlan.forceNonMainChunk) {
    outputCssHandlerOptions = {
      ...outputCssHandlerOptions,
      isMainChunk: false,
    }
  }
  let rememberedCssSources = cssSourcePlan.sources
  resolvedFromTemporaryCssAsset = cssSourcePlan.resolvedFromTemporarySource
  for (const sourceFile of cssSourcePlan.usedConfiguredSourceFiles) {
    usedConfiguredTailwindV4CssSourceFiles.add(sourceFile)
  }
  const cssCompositionPlan = resolveViteCssCompositionPlan({
    assetSourceFile,
    configuredSourceFileKeys: configuredTailwindV4CssSourceFileKeysForScope,
    cssEntries: opts.cssEntries,
    cssMatcher: opts.cssMatcher,
    explicitSourceFileKeys: configuredTailwindV4ExplicitCssEntryFileKeysForScope,
    file,
    getCssHandlerOptions,
    getOriginalCssLayerSource,
    isRootStyleOutputFile: isRootMiniProgramStyleOutputFile,
    isWebGeneratorTarget,
    normalizeConfiguredSourceFile: normalizeConfiguredTailwindV4CssEntryFileKey,
    normalizeGeneratorSource: normalizeMiniProgramGeneratorRawSource,
    normalizeGeneratorUserSource: normalizeGeneratorUserRawSource,
    outputCssHandlerOptions,
    outputFile,
    rawSource,
    rememberedSources: rememberedCssSources,
    resolveConfiguredRootInjectionTarget: resolveConfiguredCssEntryRootInjectionTarget,
    resolveMatchedOutputFile: resolveMatchedOutputFileForCurrentAsset,
    resolvedFromTemporarySource: resolvedFromTemporaryCssAsset,
    rootImportShellOutputFile,
    shouldKeepImportedCssShell: isCssImportOnlyBundleAsset(bundle, file, rawSource),
    shouldKeepRootImportShell: shouldKeepRootMiniProgramStyleAsImportShell(context.cssPipelineStrategy?.shouldKeepRootMiniProgramStyleAsImportShell?.({
      ...cssPipelineContext2,
      css: rawSource,
      file: rootImportShellOutputFile,
    })),
    shouldMoveRootImportShellToOrigin: shouldMoveRootMiniProgramStyleToImportShellOrigin(context.cssPipelineStrategy?.shouldMoveRootMiniProgramStyleToImportShellOrigin?.({
      ...cssPipelineContext2,
      file: rootImportShellOutputFile,
    })),
    shouldSkipRememberedSource: (remembered: RememberedCssSource) => {
      const shouldSkip = shouldSkipRawRememberedCssSource(remembered.rawSource, remembered.sourceFile)
      if (shouldSkip) {
        debug('css skip raw remembered source style: %s -> %s', remembered.sourceFile, outputFile)
      }
      return shouldSkip
    },
    viteProcessedCssAsset,
  })
  outputFile = cssCompositionPlan.outputFile
  activeViteCssCacheFiles.add(normalizeViteCssCacheKey(outputFile))
  activeViteCssCacheFiles.add(`planned:${normalizeViteCssCacheKey(outputFile)}`)
  outputCssHandlerOptions = cssCompositionPlan.outputCssHandlerOptions
  rememberedCssSources = cssCompositionPlan.rememberedSources
  const rememberedCssSource = cssCompositionPlan.rememberedSource
  activeViteCssCacheFiles.add(normalizeViteCssCacheKey(outputFile))
  if (cssCompositionPlan.rootImportShellTarget) {
    frameworkRootImportShellTargetByFile.set(rootImportShellOutputFile, cssCompositionPlan.rootImportShellTarget)
    debug('css remember framework root import shell target: %s -> %s', rootImportShellOutputFile, cssCompositionPlan.rootImportShellTarget)
  }
  if (cssCompositionPlan.preserveImportedCssShell) {
    applyCssResult(rawSource)
    markCssAssetProcessed?.(originalSource, outputFile)
    recordCssAssetResult?.(outputFile, rawSource)
    onUpdate(outputFile, rawSource, rawSource)
    debug('css preserve imported shell asset: %s', outputFile)
    return
  }
  if (cssCompositionPlan.usedConfiguredSourceFile) {
    usedConfiguredTailwindV4CssSourceFiles.add(normalizeOutputPathKey(cssCompositionPlan.usedConfiguredSourceFile))
    temporaryCssAssetSourceResolver.markUsed(cssCompositionPlan.usedConfiguredSourceFile)
  }
  await processViteCssEntryTransform({
    ...options,
    alreadyProcessedCssAsset,
    applyCssResult,
    assetSourceFile,
    cssAssetIdentity,
    cssCompositionPlan,
    outputCssHandlerOptions,
    outputFile,
    rawSource,
    rememberedCssSource,
    rememberedCssSources,
    resolvedFromConfiguredOriginalCssEntry,
    viteProcessedCssAsset,
  })
}
