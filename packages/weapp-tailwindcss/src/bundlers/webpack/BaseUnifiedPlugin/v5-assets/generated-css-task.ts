import type { WebpackCssAssetTaskContext } from './processed-css-task'
import path from 'node:path'
import { filterExistingCssRules } from '@weapp-tailwindcss/postcss/transform'
import { hasTailwindApplyDirective, hasTailwindRootDirectives, removeTailwindSourceDirectives } from '../../../../generation/directives'
import { hasTailwindGeneratedCss, hasTailwindGeneratedCssMarkers, hasTailwindSourceDirectives, isPureLocalCssImportWrapper } from '../../../../generation/index'
import { removeGeneratedSelectorCompatCss } from '../../../../generation/legacy-selectors'
import { generateTailwindV4Css } from '../../../../generation/service'
import { isCommentOnlyCss } from '../../../../generation/user-css'
import { processCachedTask } from '../../../shared/cache'
import { hasBundlerGeneratedCssMarker, stripBundlerGeneratedCssMarkers } from '../../../shared/generated-css-marker'
import { resolveTailwindV4EntriesFromCssCached } from '../../../shared/source-scan'
import { createScopedGeneratorRuntime } from '../../../vite/generate-bundle/scoped-generator'
import { isWebpackCssLoaderRuntimeSource } from '../../shared/css-loader-runtime'
import { createRuntimeAwareCssHash } from '../shared'
import { finalizeWebpackGeneratedCssResult } from './generated-css-result'

import {
  collectWebpackBareSelectorUserCss,
  createWebpackCurrentAssetUserRawSource,
  createWebpackGeneratorUserCssSourceAppend,
  createWebpackUserCssSourceAppend,
  hasAdditionalWebpackAssetUserCssMarkers,
  hasProcessedCssAssetUrl,
  hasUsableWebpackGeneratorCssSources,
  normalizeWebpackGeneratorCssSources,
  removeWebpackGeneratorNonTailwindImports,
  removeWebpackTailwindGeneratedAssetCss,
  resolveWebpackGeneratorRawSource,
  scopeWebpackGeneratorOptionsToCssSource,
  shouldAppendCurrentWebpackAssetUserCss,
  shouldConsumeWebpackLoaderGeneratedCss,
  shouldFallbackToWebpackUserCssOnGeneratorError,
  shouldUseWebpackAssetAsGeneratorUserCss,
} from './pipeline-helpers'

export async function processWebpackGeneratedCssAsset(element: any, context: WebpackCssAssetTaskContext) {
  const { ConcatSource, affectedCompilationScopes, assetHashByChunk, compilation, compilationChanges, compilerOptions, configuredCssEntryFiles, configuredMainCssEntryFiles, createRuntimeSetHash, cssSourceTraceSignature, cssSources, cssTaskFactories, debug, enqueueTask, finalizeCssAssetSource, finalizeTracedCss, generatedCssSources, generatorRuntimeSet, getCompilationDependencyRevision, getCssHandlerOptions, getCssUserHandlerOptions, getGeneratorRuntimeSet, hasConfiguredTailwindV4SourceRoots, isSameWebpackSourceScope, isWebGeneratorTarget, rememberProcessCacheKey, resolveWebpackCssSourceFile, runtimeAffectingSourceHash, runtimeState, transformRuntimeSet, updateAssetIfChanged, watchMode, webpackSourceCandidateValueSignature, webpackSourceCandidates } = context
  const [file, originalSource] = element
  const currentRawSource = originalSource.source().toString()
  const chunkHash = assetHashByChunk.get(file)
  const cacheKey = file
  const hashKey = `${file}:asset`
  rememberProcessCacheKey(cacheKey, hashKey)
  const cssHandlerOptionsForHash = getCssHandlerOptions(file, currentRawSource)
  const compilationScope = {
    id: file,
    kind: cssHandlerOptionsForHash.isMainChunk ? 'global' as const : 'component' as const,
  }
  const scopeCompilationChanges = affectedCompilationScopes.has(compilationScope.id)
    ? compilationChanges
    : undefined
  const compilationDependencyRevision = getCompilationDependencyRevision(compilationScope.id)
  const cssChunkHash = watchMode
    && cssHandlerOptionsForHash.isMainChunk
    ? undefined
    : chunkHash
  const cssSourceHash = (() => {
    const sourceFile = resolveWebpackCssSourceFile(file, currentRawSource)
    const sourceCss = sourceFile ? cssSources.get(sourceFile)?.css : undefined
    const loaderCss = sourceFile ? generatedCssSources.get(sourceFile)?.css : undefined
    const loaderHash = loaderCss === undefined ? 'loader:0' : compilerOptions.cache.computeHash(loaderCss)
    const generatorSourceCss = removeWebpackGeneratorNonTailwindImports(sourceCss)
    if (sourceCss === undefined) {
      return sourceFile === undefined
        ? `webpack-css-source:0:${loaderHash}`
        : `webpack-css-source:0:${sourceFile}:${loaderHash}`
    }
    // @config 变化不一定改变入口文本或类名，但会改变 loader 已生成的样式值。
    return `webpack-css-source:1:${compilerOptions.cache.computeHash(sourceCss)}:${generatorSourceCss === sourceCss || generatorSourceCss === undefined ? 'generator-source:0' : compilerOptions.cache.computeHash(generatorSourceCss)}:${loaderHash}`
  })()
  const runtimeAwareHash = createRuntimeAwareCssHash(
    cssChunkHash,
    compilerOptions.cache.computeHash(currentRawSource),
    `${createRuntimeSetHash(getGeneratorRuntimeSet())}:${runtimeAffectingSourceHash}:${webpackSourceCandidates?.signatureHash ?? 'source-candidates:0'}:${webpackSourceCandidateValueSignature}:${cssSourceTraceSignature}:${cssSourceHash}:compiler-dependencies:${compilationDependencyRevision}`,
  )
  await enqueueTask(async () => {
    await processCachedTask({
      cache: compilerOptions.cache,
      cacheKey,
      hashKey,
      rawSource: currentRawSource,
      hash: runtimeAwareHash,
      applyResult(source, { cacheHit }) {
        updateAssetIfChanged(file, source, {
          compare: !cacheHit,
          notifyUpdate: !cacheHit,
        })
      },
      onCacheHit() {
        debug('css cache hit: %s', file)
      },
      transform: async () => {
        await runtimeState.readyPromise
        const cssHandlerOptions = getCssHandlerOptions(file, currentRawSource)
        const generatorRawSource = resolveWebpackGeneratorRawSource(currentRawSource, cssHandlerOptions)
        if (isWebpackCssLoaderRuntimeSource(generatorRawSource)) {
          return {
            result: new ConcatSource(currentRawSource),
          }
        }
        const sourceFile = cssHandlerOptions.sourceOptions?.sourceFile
        const sourceCss = sourceFile ? cssSources.get(path.resolve(sourceFile))?.css : undefined
        const isConfiguredCssSource = sourceFile !== undefined
          && configuredCssEntryFiles.some((entry: string) => path.resolve(entry) === path.resolve(sourceFile))
        const isConfiguredMainCssSource = sourceFile !== undefined
          && configuredMainCssEntryFiles.some((entry: string) => path.resolve(entry) === path.resolve(sourceFile))
        const sourceCssHasTailwindRoot = sourceCss !== undefined
          && hasTailwindRootDirectives(sourceCss, { importFallback: true })
        const shouldPreserveExistingPreflight = cssHandlerOptions.isMainChunk
          || (!isConfiguredMainCssSource && (isConfiguredCssSource || sourceCssHasTailwindRoot))
        const loaderGeneratedCss = sourceFile
          ? generatedCssSources.get(path.resolve(sourceFile))
          : undefined
        const shouldRegenerateExplicitTailwindV4CssSource = sourceCss !== undefined
          && (
            hasTailwindSourceDirectives(sourceCss, { importFallback: true })
            || sourceCss.includes('@config')
          )
        const explicitTailwindV4SourceCandidates = shouldRegenerateExplicitTailwindV4CssSource
          && sourceCss
          && sourceFile
          && webpackSourceCandidates?.getSourceCandidatesForEntries
          ? await resolveTailwindV4EntriesFromCssCached(sourceCss, path.dirname(sourceFile))
              .then(resolved => resolved?.entries
                ? webpackSourceCandidates.getSourceCandidatesForEntries(resolved.entries)
                : undefined)
          : undefined
        if (
          loaderGeneratedCss
          && shouldConsumeWebpackLoaderGeneratedCss({
            allowMarkerlessRegistryMatch: configuredCssEntryFiles.length === 1,
            hasBundlerGeneratedCssMarker: hasBundlerGeneratedCssMarker(currentRawSource),
            loaderGeneratedClassSet: loaderGeneratedCss.classSet,
            sourceCandidates: explicitTailwindV4SourceCandidates,
            shouldRegenerateExplicitTailwindV4CssSource,
            watchMode,
          })
        ) {
          for (const className of loaderGeneratedCss.classSet) {
            generatorRuntimeSet.add(className)
            transformRuntimeSet.add(className)
          }
          for (const dependency of loaderGeneratedCss.dependencies) {
            compilation.fileDependencies?.add?.(dependency)
          }
          const currentRawSourceWithoutBundlerMarkers = stripBundlerGeneratedCssMarkers(currentRawSource)
          const currentAssetHasProcessedUrl = hasProcessedCssAssetUrl(currentRawSourceWithoutBundlerMarkers)
            && currentRawSourceWithoutBundlerMarkers !== loaderGeneratedCss.css
          const currentAssetUserCss = currentAssetHasProcessedUrl
            ? currentRawSourceWithoutBundlerMarkers
            : shouldUseWebpackAssetAsGeneratorUserCss(currentRawSourceWithoutBundlerMarkers, loaderGeneratedCss.css, {
              processed: true,
            })
              ? removeGeneratedSelectorCompatCss(
                  currentRawSourceWithoutBundlerMarkers,
                  loaderGeneratedCss.css,
                )
              : undefined
          const loaderGeneratedCssWithoutMarkers = stripBundlerGeneratedCssMarkers(loaderGeneratedCss.css)
          const currentAssetUserCssWithoutMarkers = currentAssetUserCss === undefined
            ? ''
            : stripBundlerGeneratedCssMarkers(currentAssetUserCss)
          const currentAssetUserCssHasRules = currentAssetUserCssWithoutMarkers.trim().length > 0
            && !isCommentOnlyCss(currentAssetUserCssWithoutMarkers)
          const currentAssetMissingUserCss = !currentAssetUserCssHasRules
            ? ''
            : filterExistingCssRules(currentAssetUserCssWithoutMarkers, loaderGeneratedCssWithoutMarkers)
          if (
            isConfiguredMainCssSource
            && !cssHandlerOptions.isMainChunk
          ) {
            debug('css skip duplicate webpack loader main generation: %s <- %s', file, sourceFile)
            const userCss = currentAssetMissingUserCss.trim().length === 0 || isCommentOnlyCss(currentAssetMissingUserCss)
              ? ''
              : finalizeCssAssetSource(currentAssetMissingUserCss, {
                  cssPreflight: false,
                  generatedCss: false,
                })
            return {
              result: new ConcatSource(finalizeTracedCss(userCss, cssHandlerOptions)),
            }
          }
          const mergedLoaderCss = currentAssetUserCss === undefined
            ? loaderGeneratedCss.css
            : (createWebpackGeneratorUserCssSourceAppend(
                {
                  css: currentAssetUserCss === undefined
                    ? loaderGeneratedCss.css
                    : currentAssetHasProcessedUrl
                      ? removeGeneratedSelectorCompatCss(loaderGeneratedCss.css, currentAssetUserCss)
                      : filterExistingCssRules(currentAssetUserCss, loaderGeneratedCss.css),
                  processed: true,
                },
                currentAssetUserCss === undefined
                  ? undefined
                  : {
                      css: currentAssetUserCss,
                      processed: true,
                    },
              )!.css)
          const handledLoaderCss = isWebGeneratorTarget
            ? mergedLoaderCss
            : (await compilerOptions.styleHandler(mergedLoaderCss, cssHandlerOptions)).css
          const finalizedLoaderCss = finalizeCssAssetSource(handledLoaderCss, {
            cssPreflight: cssHandlerOptions.isMainChunk,
            generatedCss: true,
            preserveExistingPreflight: shouldPreserveExistingPreflight,
          })
          const loaderSourceBareUserCss = isWebGeneratorTarget
            ? undefined
            : createWebpackGeneratorUserCssSourceAppend(
                ...[
                  currentAssetUserCss === undefined
                    ? undefined
                    : {
                        css: currentAssetUserCss,
                        processed: true,
                      },
                  sourceCss === undefined
                    ? undefined
                    : {
                        css: sourceCss,
                        processed: false,
                      },
                ].map((source) => {
                  if (source === undefined) {
                    return undefined
                  }
                  return {
                    css: collectWebpackBareSelectorUserCss(source.css),
                    processed: source.processed,
                  }
                }),
              )
          const handledLoaderSourceBareUserCss = loaderSourceBareUserCss === undefined
            ? ''
            : loaderSourceBareUserCss.processed
              ? loaderSourceBareUserCss.css
              : (await compilerOptions.styleHandler(loaderSourceBareUserCss.css, cssHandlerOptions)).css
          const finalizedLoaderSourceBareUserCss = handledLoaderSourceBareUserCss.trim().length === 0
            ? ''
            : finalizeCssAssetSource(handledLoaderSourceBareUserCss, {
                cssPreflight: false,
                generatedCss: false,
              })
          const missingLoaderSourceBareUserCss = finalizedLoaderSourceBareUserCss.trim().length === 0
            ? ''
            : filterExistingCssRules(finalizedLoaderCss, finalizedLoaderSourceBareUserCss)
          const css = finalizeTracedCss(
            missingLoaderSourceBareUserCss.trim().length === 0
              ? finalizedLoaderCss
              : createWebpackGeneratorUserCssSourceAppend(
                {
                  css: finalizedLoaderCss,
                  processed: true,
                },
                {
                  css: missingLoaderSourceBareUserCss,
                  processed: true,
                },
              )!.css,
            cssHandlerOptions,
            { finalized: true },
          )
          debug('css consume webpack loader generation: %s <- %s', file, sourceFile)
          return {
            result: new ConcatSource(css),
          }
        }
        const sourceCssProcessed = sourceFile ? cssSources.get(path.resolve(sourceFile))?.processed === true : false
        const registeredUserRawSource = createWebpackUserCssSourceAppend(
          [...cssSources.entries()].map(([registeredSourceFile, source]) => ({
            ...source,
            file: registeredSourceFile,
          })),
          generatorRawSource,
          sourceFile,
          registeredSourceFile => isSameWebpackSourceScope(file, registeredSourceFile, sourceFile),
        )
        const currentAssetLooksGenerated = hasTailwindGeneratedCss(currentRawSource)
          || hasTailwindGeneratedCssMarkers(currentRawSource)
        const currentAssetHasBundlerGeneratedMarker = hasBundlerGeneratedCssMarker(currentRawSource)
        const currentAssetUserCssSource = currentAssetLooksGenerated
          ? removeWebpackTailwindGeneratedAssetCss(currentRawSource)
          : currentRawSource
        if (
          sourceFile === undefined
          && currentAssetHasBundlerGeneratedMarker
          && (
            currentAssetUserCssSource.trim().length === 0
            || isCommentOnlyCss(currentAssetUserCssSource)
          )
        ) {
          return {
            result: new ConcatSource(finalizeTracedCss('', cssHandlerOptions)),
          }
        }
        const currentAssetHasAdditionalUserCss = currentAssetLooksGenerated
          && (
            hasAdditionalWebpackAssetUserCssMarkers(currentAssetUserCssSource, generatorRawSource)
            || currentAssetUserCssSource.trim().length > 0
          )
        const shouldPreserveGeneratedWebAssetUserCss = isWebGeneratorTarget
          && currentAssetLooksGenerated
          && !currentAssetHasBundlerGeneratedMarker
          && !currentAssetHasAdditionalUserCss
        const hasExplicitSourceCssForCurrentAsset = sourceCss !== undefined
          && (
            hasTailwindRootDirectives(sourceCss, { importFallback: true })
            || hasTailwindSourceDirectives(sourceCss, { importFallback: true })
            || hasTailwindApplyDirective(sourceCss)
          )
        const currentAssetHasUserCss = (sourceCssProcessed || hasExplicitSourceCssForCurrentAsset) && currentAssetLooksGenerated && !shouldPreserveGeneratedWebAssetUserCss
          ? currentAssetHasAdditionalUserCss
          : shouldUseWebpackAssetAsGeneratorUserCss(currentAssetUserCssSource, generatorRawSource, {
              processed: sourceCssProcessed || shouldPreserveGeneratedWebAssetUserCss,
            })
        const shouldAppendCurrentAssetUserCss = shouldAppendCurrentWebpackAssetUserCss({
          currentAssetHasBundlerGeneratedMarker,
          currentAssetHasUserCss,
          currentAssetLooksGenerated,
          registeredUserRawSource,
          shouldPreserveGeneratedWebAssetUserCss,
          sourceCssProcessed,
        })
        const userRawSource = createWebpackGeneratorUserCssSourceAppend(
          createWebpackCurrentAssetUserRawSource({
            currentAssetHasUserCss,
            currentAssetLooksGenerated,
            currentAssetUserCssSource,
            shouldAppendCurrentAssetUserCss,
            sourceCssProcessed,
          }),
          registeredUserRawSource,
        )
        if (isPureLocalCssImportWrapper(currentRawSource)) {
          return {
            result: new ConcatSource(removeTailwindSourceDirectives(
              stripBundlerGeneratedCssMarkers(currentRawSource),
              { importFallback: true },
            )),
          }
        }
        const fallbackGeneratorRuntimeSet = getGeneratorRuntimeSet()
        const hasExplicitTailwindV4SourceCss = sourceCss !== undefined
          && (
            hasTailwindSourceDirectives(sourceCss, { importFallback: true })
            || sourceCss.includes('@config')
          )
        const currentAssetHasTailwindDirectives = hasTailwindRootDirectives(generatorRawSource, { importFallback: true })
          || hasTailwindSourceDirectives(generatorRawSource, { importFallback: true })
          || hasTailwindApplyDirective(generatorRawSource)
        const shouldForceTailwindV4Generation = hasConfiguredTailwindV4SourceRoots()
          && (
            (configuredMainCssEntryFiles.length > 0 && sourceFile !== undefined)
            || currentAssetHasTailwindDirectives
            || hasExplicitTailwindV4SourceCss
          )
        const shouldSkipUnmatchedMainCssGeneration = !isWebGeneratorTarget
          && cssHandlerOptions.isMainChunk
          && sourceFile === undefined
          && configuredMainCssEntryFiles.length > 0
          && !currentAssetHasTailwindDirectives
        const shouldSkipPlainNonMainCssGeneration = !cssHandlerOptions.isMainChunk
          && sourceCss !== undefined
          && !hasExplicitSourceCssForCurrentAsset
          && !hasExplicitTailwindV4SourceCss
          && !currentAssetHasTailwindDirectives
        const shouldMergeFallbackGeneratorRuntime = cssHandlerOptions.isMainChunk
          || currentAssetHasTailwindDirectives
          || hasExplicitSourceCssForCurrentAsset
        const scopedFallbackGeneratorRuntimeSet = hasExplicitTailwindV4SourceCss || !shouldMergeFallbackGeneratorRuntime
          ? new Set<string>()
          : fallbackGeneratorRuntimeSet
        const resolvedScopedGeneratorRuntimeSet = await createScopedGeneratorRuntime({
          cssHandlerOptions,
          fallbackRuntime: scopedFallbackGeneratorRuntimeSet,
          getSourceCandidatesForEntries: webpackSourceCandidates?.getSourceCandidatesForEntries,
          majorVersion: runtimeState.tailwindRuntime.majorVersion,
          outputFile: file,
          rawSource: sourceFile ? (cssSources.get(path.resolve(sourceFile))?.css ?? generatorRawSource) : generatorRawSource,
          shouldExcludeSubpackageSourceCandidates: () => false,
          sourceFile: sourceFile ?? file,
          scopedSourceCandidateGetter: webpackSourceCandidates?.getSourceCandidatesForEntries,
        })
        const scopedGeneratorRuntimeSet = !hasExplicitTailwindV4SourceCss
          && resolvedScopedGeneratorRuntimeSet !== scopedFallbackGeneratorRuntimeSet
          && shouldMergeFallbackGeneratorRuntime
          ? new Set([
              ...fallbackGeneratorRuntimeSet,
              ...resolvedScopedGeneratorRuntimeSet,
            ])
          : resolvedScopedGeneratorRuntimeSet
        const generatorCssSources = normalizeWebpackGeneratorCssSources(cssHandlerOptions.sourceOptions?.cssSources)
        const scopedGeneratorCompilerOptions = scopeWebpackGeneratorOptionsToCssSource(compilerOptions, sourceFile, {
          disableUnmatchedCssEntries: !isWebGeneratorTarget && cssHandlerOptions.isMainChunk,
        })
        const generatorCssHandlerOptions = generatorCssSources === undefined
          ? cssHandlerOptions
          : {
              ...cssHandlerOptions,
              sourceOptions: {
                ...cssHandlerOptions.sourceOptions,
                cssSources: generatorCssSources,
              },
            }
        const generatorOptions = {
          opts: scopedGeneratorCompilerOptions,
          runtimeState,
          runtime: scopedGeneratorRuntimeSet,
          rawSource: generatorRawSource,
          forceGenerator: shouldForceTailwindV4Generation,
          ...(hasUsableWebpackGeneratorCssSources(generatorCssSources)
            ? { cssSources: generatorCssSources }
            : {}),
          ...(userRawSource === undefined ? {} : { userRawSource: userRawSource.css }),
          ...(userRawSource?.processed === true ? { userRawSourceProcessed: true } : {}),
          file,
          cssHandlerOptions: generatorCssHandlerOptions,
          cssUserHandlerOptions: getCssUserHandlerOptions(file),
          compilationChanges: scopeCompilationChanges,
          frameworkPostcssOwner: compilerOptions,
          cssStage: 'framework-processed' as const,
          getSourceCandidatesForEntries: webpackSourceCandidates?.getSourceCandidatesForEntries,
          sourceCandidates: scopedGeneratorRuntimeSet,
          restoreLocalCssImports: false,
          scope: compilationScope,
          styleHandler: compilerOptions.styleHandler,
          debug,
        }
        let generated: Awaited<ReturnType<typeof generateTailwindV4Css>>
        if (!shouldSkipUnmatchedMainCssGeneration && !shouldSkipPlainNonMainCssGeneration) {
          try {
            generated = await generateTailwindV4Css({
              ...generatorOptions,
              outputFile: file,
            })
          }
          catch (error) {
            const shouldFallbackToUserCss = shouldFallbackToWebpackUserCssOnGeneratorError({
              configuredMainCssEntryFilesLength: configuredMainCssEntryFiles.length,
              generatorRawSource,
              hasExplicitTailwindV4SourceCss,
            })
            if (!shouldFallbackToUserCss) {
              throw error
            }
            debug('css generator skipped for plain webpack css asset: %s %O', file, error)
            generated = undefined
          }
        }
        else {
          debug('css generator skipped for plain webpack css asset: %s', file)
        }
        for (const dependency of generated?.dependencies ?? []) {
          compilation.fileDependencies?.add?.(dependency)
        }
        return finalizeWebpackGeneratedCssResult({
          ConcatSource,
          compilerOptions,
          cssHandlerOptions,
          currentRawSource,
          debug,
          file,
          finalizeCssAssetSource,
          finalizeTracedCss,
          generated,
          generatorRawSource,
          generatorRuntimeSet,
          isWebGeneratorTarget,
          runtimeState,
          shouldPreserveExistingPreflight,
          sourceCss,
          sourceCssProcessed,
          userRawSource,
        })
      },
    })
  }, cssTaskFactories, 'tasks.css')
}
