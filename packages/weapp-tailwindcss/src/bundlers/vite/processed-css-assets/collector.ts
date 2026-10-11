import type { OutputBundle } from 'rollup'
import type { CollectViteProcessedCssAssetOptions, InjectViteProcessedCssAssetOptions } from './markers-imports'
import { containsCssAfterMinify, filterExistingCssRules, mergeCoveredCssRuleDeclarations, mergeMiniProgramPreflightRuleDeclarations, mergeMiniProgramThemeScopeRuleDeclarations } from '@weapp-tailwindcss/postcss/transform'
import { extractMarkedUserLayerComponentsCss, mergeMarkedUserLayerComponentsCss } from '../../../generation/user-layer-order'
import { stripBundlerGeneratedCssMarkers } from '../../shared/generated-css-marker'
import { normalizeOutputPathKey } from '../../shared/module-graph'
import { isSubpackageOutputFile } from '../generate-bundle/subpackages'
import { getActiveViteSourceOutputRelationOwner } from '../source-output-relations'
import { collectBundleAssetFiles, collectImportedBundleCssSources, findBundleAssetByOutputFile, isCoveredViteGeneratedSourceAsset, removeCommentOnlyAtRules, resolveConfiguredCssEntryRootInjectionTarget, resolveViteGeneratedCssMarkerOutputFile, restoreCssImportAtRules } from './cleanup'
import { collectSingleViteGeneratedCssMarkerFile, prepareImportedCssCoverage, removeCssCoveredByRootStyleBundleSources, shouldFilterRootGeneratedCssMarkerForScopedAsset } from './coverage'
import { isRootStyleOutputFile, isViteProcessedCssResultCoveredByImportedBundleAsset, isViteProcessedCssResultImported, removeCoveredInjectedSourceAssets, removeCssCoveredByImportedViteResults, removeCssRulesCoveredBySources, resolvePreservedImportShellInjectionTarget, shouldInjectViteProcessedCssResult, shouldPreserveMiniProgramImportShell, shouldReplayViteProcessedCssIntoMainCss, shouldUseCssAssetAsMainInjectionTarget } from './injection-plan'
import { appendCss, clearAssetSource, collectImportedStyleFiles, collectMatchingGeneratedCssMarkerFiles, dedupeViteCssResults, getAssetFile, hasNonCommentCss, isCssOutputFile, normalizeInjectableCssForTarget, normalizeInjectableCssForTargetWithImports, readAssetSource, removeTailwindEntryDirectivesFromCss, resolveViteProcessedCssAssetSource } from './markers-imports'

export function collectViteProcessedCssAssetResults(
  bundle: OutputBundle,
  options: CollectViteProcessedCssAssetOptions,
) {
  let collected = 0
  const existingAssetFiles = collectBundleAssetFiles(bundle)
  for (const [bundleFile, output] of Object.entries(bundle)) {
    if (output.type !== 'asset') {
      continue
    }
    const file = getAssetFile(bundleFile, output)
    if (!isCssOutputFile(file)) {
      continue
    }
    const rawSource = readAssetSource(output)
    const singleMarkerFile = collectSingleViteGeneratedCssMarkerFile(rawSource)
    if (singleMarkerFile) {
      // 框架可能改变样式文件名；生成标记提供源码与实际产物的身份关系。
      getActiveViteSourceOutputRelationOwner()?.recordOwnedOutput(singleMarkerFile, file)
      options.debug?.('css marker ownership: %s -> %s', singleMarkerFile, file)
    }
    if (!options.isViteProcessedCssAsset?.(output, file)) {
      continue
    }
    let nextCss = resolveViteProcessedCssAssetSource(
      file,
      rawSource,
      options.resolveViteProcessedCssOutputFile,
    )
    if (
      singleMarkerFile
      && (
        options.subpackageRoots == null
        || !isSubpackageOutputFile(file, options.subpackageRoots)
      )
      && shouldFilterRootGeneratedCssMarkerForScopedAsset(file, singleMarkerFile, options.resolveViteProcessedCssOutputFile)
    ) {
      nextCss = removeCssCoveredByRootStyleBundleSources(bundle, file, nextCss)
    }
    nextCss = options.transformCss?.(nextCss, file) ?? nextCss
    if (nextCss !== rawSource) {
      output.source = nextCss
      options.onAssetWrite?.(file)
    }
    options.markCssAssetProcessed?.(output, file)
    options.recordCssAssetResult?.(file, nextCss)
    const resolvedOutputFile = resolveViteGeneratedCssMarkerOutputFile(
      file,
      singleMarkerFile,
      existingAssetFiles,
      options.resolveViteProcessedCssOutputFile,
    )
    const webviewRootCssInjectionTarget = options.opts
      ? resolveConfiguredCssEntryRootInjectionTarget(
          bundle,
          options,
          singleMarkerFile ?? file,
          resolvedOutputFile,
        )
      : undefined
    const recordOutputFile = webviewRootCssInjectionTarget ?? resolvedOutputFile
    if (
      singleMarkerFile
      && normalizeOutputPathKey(resolvedOutputFile) !== normalizeOutputPathKey(file)
      && !isRootStyleOutputFile(resolvedOutputFile)
      && existingAssetFiles.has(normalizeOutputPathKey(resolvedOutputFile))
    ) {
      const targetAsset = findBundleAssetByOutputFile(bundle, resolvedOutputFile)
      if (targetAsset) {
        const targetRawSource = readAssetSource(targetAsset)
        const missingCss = filterExistingCssRules(targetRawSource, nextCss).trim()
        const targetNextCss = appendCss(targetRawSource, missingCss)
        if (targetNextCss !== targetRawSource) {
          targetAsset.source = targetNextCss
          options.onAssetWrite?.(resolvedOutputFile)
          options.markCssAssetProcessed?.(targetAsset, resolvedOutputFile)
          options.recordCssAssetResult?.(resolvedOutputFile, targetNextCss)
        }
        clearAssetSource(output)
        options.recordCssAssetResult?.(file, '')
        options.recordViteProcessedCssAssetResult?.(resolvedOutputFile, targetNextCss, {
          outputFile: resolvedOutputFile,
        })
        if (isCoveredViteGeneratedSourceAsset(file, existingAssetFiles, options.resolveViteProcessedCssOutputFile)) {
          delete bundle[bundleFile]
        }
        options.debug?.('move vite-generated css asset by marker source: %s -> %s bytes=%d', file, resolvedOutputFile, nextCss.length)
        collected++
        continue
      }
    }
    const shouldReplayIntoMainCss = options.opts != null
      && (
        webviewRootCssInjectionTarget != null
        || shouldReplayViteProcessedCssIntoMainCss(
          options.opts,
          file,
          singleMarkerFile,
          resolvedOutputFile,
          options.subpackageRoots,
        )
      )
    options.recordViteProcessedCssAssetResult?.(file, nextCss, {
      injectIntoMain: shouldReplayIntoMainCss || undefined,
      outputFile: recordOutputFile,
    })
    if (normalizeOutputPathKey(recordOutputFile) !== normalizeOutputPathKey(file)) {
      options.recordViteProcessedCssAssetResult?.(recordOutputFile, nextCss, {
        injectIntoMain: shouldReplayIntoMainCss || undefined,
        outputFile: recordOutputFile,
      })
    }
    for (const markerFile of collectMatchingGeneratedCssMarkerFiles(
      file,
      rawSource,
      options.resolveViteProcessedCssOutputFile,
    )) {
      if (normalizeOutputPathKey(markerFile) === normalizeOutputPathKey(file)) {
        continue
      }
      options.recordViteProcessedCssAssetResult?.(markerFile, nextCss, {
        injectIntoMain: shouldReplayIntoMainCss || undefined,
        outputFile: recordOutputFile,
      })
      if (
        normalizeOutputPathKey(recordOutputFile) !== normalizeOutputPathKey(markerFile)
        && normalizeOutputPathKey(recordOutputFile) !== normalizeOutputPathKey(file)
      ) {
        options.recordViteProcessedCssAssetResult?.(recordOutputFile, nextCss, {
          injectIntoMain: shouldReplayIntoMainCss || undefined,
          outputFile: recordOutputFile,
        })
      }
    }
    if (isCoveredViteGeneratedSourceAsset(file, existingAssetFiles, options.resolveViteProcessedCssOutputFile)) {
      delete bundle[bundleFile]
      options.debug?.('skip covered vite-generated source css asset: %s', file)
      collected++
      continue
    }
    options.debug?.('collect vite-processed css asset: %s bytes=%d', file, nextCss.length)
    collected++
  }
  return collected
}

export function injectViteProcessedCssIntoMainCssAssets(
  bundle: OutputBundle,
  options: InjectViteProcessedCssAssetOptions,
) {
  const measure = <T>(name: string, task: () => T) => {
    const startedAt = performance.now()
    const result = task()
    options.recordTimingDetail?.(`finalize.processedCss.inject.${name}`, startedAt)
    return result
  }
  const transformCss = (css: string, file: string) => options.transformCss?.(css, file) ?? css
  const viteCssResults = measure('prepareResults', () => dedupeViteCssResults(
    [...(options.getViteProcessedCssAssetResults?.() ?? [])].map(([file, record]) => {
      return typeof record === 'string'
        ? { file, css: record, injectIntoMain: undefined }
        : { file, css: record.css, injectIntoMain: record.injectIntoMain, outputFile: record.outputFile }
    }),
  )
    .map(record => ({
      ...record,
      css: transformCss(record.css, record.outputFile ?? record.file),
    }))
    .filter(record => record.css.length > 0))
  let injected = 0
  for (const [bundleFile, bundleOutput] of Object.entries(bundle)) {
    let output = bundleOutput
    if (bundle[bundleFile] !== bundleOutput) {
      continue
    }
    if (output.type !== 'asset') {
      continue
    }
    let file = getAssetFile(bundleFile, output)
    if (
      !options.opts.cssMatcher(file)
      || !shouldUseCssAssetAsMainInjectionTarget(options.opts, file, viteCssResults, options, bundle)
    ) {
      continue
    }
    let originalSource = readAssetSource(output)
    if (shouldPreserveMiniProgramImportShell(options, bundle, file, originalSource)) {
      const importedTargetFile = resolvePreservedImportShellInjectionTarget(options, bundle, file, originalSource)
      if (typeof importedTargetFile === 'string') {
        options.debug?.('preserve mini-program css import shell asset: %s -> %s', file, importedTargetFile)
        const importedOutput = Object.entries(bundle).find(([candidateFile, candidate]) =>
          candidate.type === 'asset'
          && normalizeOutputPathKey(getAssetFile(candidateFile, candidate)) === normalizeOutputPathKey(importedTargetFile),
        )?.[1]
        if (importedOutput?.type === 'asset') {
          output = importedOutput
          file = importedTargetFile
          originalSource = readAssetSource(output)
        }
        else {
          continue
        }
      }
      else {
        options.debug?.('preserve mini-program css import shell asset: %s', file)
        continue
      }
    }
    const fileKey = normalizeOutputPathKey(file)
    const mainFileKey = normalizeOutputPathKey(file)
    const normalizedOriginalCss = measure('normalizeTarget', () => normalizeInjectableCssForTargetWithImports(
      transformCss(removeTailwindEntryDirectivesFromCss(originalSource, options.createCssPipelineContext?.(file)?.currentGeneratorBranch?.isWeb === true), file),
      file,
    ))
    let nextCss = normalizedOriginalCss.css
    const importedStyleFiles = normalizedOriginalCss.importedStyleFiles
    const importedBundleCssSources = collectImportedBundleCssSources(bundle, importedStyleFiles)
    const importedBundleCssCoverage = prepareImportedCssCoverage(importedBundleCssSources)
    nextCss = removeCssCoveredByImportedViteResults(
      nextCss,
      importedBundleCssSources,
      importedBundleCssCoverage,
    )
    const importedViteCssResults = viteCssResults.filter(record => isViteProcessedCssResultImported(record, importedStyleFiles))
    const bundleAssetFiles = collectBundleAssetFiles(bundle)
    const uncoveredImportedViteCssResults = importedViteCssResults.filter(
      record => !isViteProcessedCssResultCoveredByImportedBundleAsset(record, importedStyleFiles, bundleAssetFiles),
    )
    const importedCssSources = [
      ...importedBundleCssSources,
      ...uncoveredImportedViteCssResults.map(record => record.css),
    ]
    const uncoveredImportedCssSources = uncoveredImportedViteCssResults.map(record => record.css)
    nextCss = removeCssCoveredByImportedViteResults(
      nextCss,
      uncoveredImportedCssSources,
      prepareImportedCssCoverage(uncoveredImportedCssSources),
    )
    const importedCssCoverage = prepareImportedCssCoverage(importedCssSources)
    const targetViteCssResults: typeof viteCssResults = []
    for (const record of viteCssResults) {
      if (!isRootStyleOutputFile(file)) {
        if (
          typeof record.outputFile !== 'string'
          || normalizeOutputPathKey(record.outputFile) !== fileKey
        ) {
          continue
        }
      }
      if (!shouldInjectViteProcessedCssResult(options.opts, mainFileKey, record.file, record)) {
        continue
      }
      if (isViteProcessedCssResultImported(record, importedStyleFiles)) {
        continue
      }
      targetViteCssResults.push(record)
      let css = measure('normalizeRecord', () => normalizeInjectableCssForTarget(stripBundlerGeneratedCssMarkers(record.css).trim(), file).trim())
      css = measure('importCoverage', () => removeCssCoveredByImportedViteResults(css, importedCssSources, importedCssCoverage).trim())
      if (css.length === 0) {
        continue
      }
      const mergedLayerCss = measure('mergeLayers', () => mergeMarkedUserLayerComponentsCss(nextCss, css))
      if (mergedLayerCss.merged) {
        nextCss = mergedLayerCss.css
        css = extractMarkedUserLayerComponentsCss(css).rest.trim()
        if (css.length === 0) {
          continue
        }
      }
      const mergedPreflightDeclarations = measure('mergePreflight', () => mergeMiniProgramPreflightRuleDeclarations(nextCss, css))
      if (mergedPreflightDeclarations.changed) {
        nextCss = mergedPreflightDeclarations.baseCss
        css = mergedPreflightDeclarations.css.trim()
        if (css.length === 0) {
          continue
        }
      }
      const mergedThemeScopeDeclarations = measure('mergeTheme', () => mergeMiniProgramThemeScopeRuleDeclarations(nextCss, css))
      if (mergedThemeScopeDeclarations.changed) {
        nextCss = mergedThemeScopeDeclarations.baseCss
        css = mergedThemeScopeDeclarations.css.trim()
        if (css.length === 0) {
          continue
        }
      }
      const mergedRuleDeclarations = measure('mergeDeclarations', () => mergeCoveredCssRuleDeclarations(nextCss, css))
      if (mergedRuleDeclarations.changed) {
        nextCss = mergedRuleDeclarations.baseCss
        css = mergedRuleDeclarations.css.trim()
        if (css.length === 0) {
          continue
        }
      }
      const missingCss = measure('filterRules', () => filterExistingCssRules(nextCss, css))
      if (missingCss.length === 0 || !hasNonCommentCss(missingCss) || measure('containsMissing', () => containsCssAfterMinify(nextCss, missingCss))) {
        continue
      }
      nextCss = appendCss(nextCss, missingCss)
    }
    const finalImportedCssSources = collectImportedBundleCssSources(bundle, collectImportedStyleFiles(originalSource, file))
    const finalImportedCssCoverage = prepareImportedCssCoverage(finalImportedCssSources)
    nextCss = measure('finalizeTarget', () => transformCss(
      removeCommentOnlyAtRules(
        restoreCssImportAtRules(
          originalSource,
          removeCssRulesCoveredBySources(
            nextCss,
            finalImportedCssSources,
            { exactOnly: true },
            finalImportedCssCoverage?.coverage,
          ).trim(),
          file,
        ),
      ),
      file,
    ))
    if (nextCss.trim() === originalSource.trim()) {
      nextCss = originalSource
    }
    if (nextCss !== originalSource) {
      output.source = nextCss
      options.markCssAssetProcessed?.(output, file)
      options.recordCssAssetResult?.(file, nextCss)
      options.onUpdate?.(file, originalSource, nextCss)
      options.debug?.('inject vite-processed css into main css asset: %s bytes=%d', file, nextCss.length)
    }
    const removedSources = measure('removeSources', () => removeCoveredInjectedSourceAssets(bundle, file, nextCss, targetViteCssResults, options))
    if (nextCss === originalSource && removedSources === 0) {
      continue
    }
    injected++
  }
  return injected
}
