import type { sources } from 'webpack'
import path from 'node:path'
import { filterExistingCssRules } from '@weapp-tailwindcss/postcss/transform'
import { hasTailwindApplyDirective, hasTailwindRootDirectives } from '../../../../generation/directives'
import { hasTailwindGeneratedCss, hasTailwindGeneratedCssMarkers, hasTailwindSourceDirectives } from '../../../../generation/index'
import { processCachedTask } from '../../../shared/cache'
import { hasBundlerGeneratedCssMarker, stripBundlerGeneratedCssMarkers } from '../../../shared/generated-css-marker'
import { isWebpackCssLoaderRuntimeSource } from '../../shared/css-loader-runtime'
import { createRuntimeAwareCssHash } from '../shared'
import {
  collectWebpackBareSelectorUserCss,
  createWebpackGeneratorUserCssSourceAppend,
  createWebpackUserCssSourceAppend,
  hasAdditionalWebpackAssetUserCssMarkers,
  hasDeferredWebpackGeneratedCss,
  hasMissingRuntimeCandidates,
  removeWebpackTailwindGeneratedAssetCss,
  resolveGeneratedCssRuntimeCandidates,
  stripTrailingLineWhitespace,
} from './pipeline-helpers'

export interface WebpackCssAssetTaskContext {
  [key: string]: any
}

export async function processWebpackProcessedCssAsset(element: [string, Pick<sources.Source, 'source'>], context: WebpackCssAssetTaskContext) {
  const { ConcatSource, assetHashByChunk, compilerOptions, configuredMainCssEntryFiles, createRuntimeSetHash, cssSourceTraceSignature, cssSources, cssTaskFactories, debug, enqueueTask, finalizeCssAssetSource, finalizeTracedCss, generatedCssSources, getCssHandlerOptions, getGeneratorRuntimeSet, hasConfiguredTailwindV4SourceRoots, isKnownWebpackProcessedCssAsset, isWebGeneratorTarget, isWebpackProcessedCssAsset, processedCssAssetSkipDecisionCache, rememberProcessCacheKey, runtimeAffectingSourceHash, updateAssetIfChanged, webpackSourceCandidateSet, webpackSourceCandidateValueSignature, webpackSourceCandidates } = context
  const [file, originalSource] = element

  let rawSource: string | undefined
  const readRawSource = () => {
    rawSource ??= originalSource.source().toString()
    return rawSource
  }
  const chunkHash = assetHashByChunk.get(file)
  const cssHandlerOptionsForProcessedAsset = getCssHandlerOptions(file, readRawSource())
  const processedCssAssetMetadata = {
    isMainCssChunk: cssHandlerOptionsForProcessedAsset.isMainChunk,
  }
  const processedSourceFile = cssHandlerOptionsForProcessedAsset.sourceOptions?.sourceFile
  const processedSourceCss = processedSourceFile ? cssSources.get(path.resolve(processedSourceFile))?.css : undefined
  const shouldRegenerateProcessedTailwindV4SourceCss = processedSourceCss !== undefined
    && (
      hasTailwindSourceDirectives(processedSourceCss, { importFallback: true })
      || processedSourceCss.includes('@config')
    )
  const processedCssAssetKnown = isKnownWebpackProcessedCssAsset?.(file, processedCssAssetMetadata) === true
  const processedLoaderGeneratedCss = processedSourceFile
    ? generatedCssSources.get(path.resolve(processedSourceFile))
    : undefined
  // 固定文件名的 CSS asset 可在 JS chunk hash 不变时更新，已知资产同样必须核对本轮内容。
  const processedAssetSourceHash = `${compilerOptions.cache.computeHash(readRawSource())}:${processedLoaderGeneratedCss ? compilerOptions.cache.computeHash(processedLoaderGeneratedCss.css) : 'loader:0'}`
  const processedCssHashKey = createRuntimeAwareCssHash(
    chunkHash,
    processedAssetSourceHash,
    `${createRuntimeSetHash(getGeneratorRuntimeSet())}:${runtimeAffectingSourceHash}:${webpackSourceCandidates?.signatureHash ?? 'source-candidates:0'}:${webpackSourceCandidateValueSignature}:${cssSourceTraceSignature}`,
  )
  const processedCssDecisionCacheKey = `${file}:${processedCssHashKey}`
  let currentProcessedRawSource: string | undefined
  let hasGeneratedCssMarker = false
  let hasTailwindGeneratedAssetCss = false
  const readCurrentProcessedRawSource = () => {
    currentProcessedRawSource ??= readRawSource()
    return currentProcessedRawSource
  }
  const cachedSkipProcessedCssAsset = processedCssAssetKnown
    ? processedCssAssetSkipDecisionCache.get(processedCssDecisionCacheKey)
    : undefined
  const shouldRegenerateStaleProcessedWebCssAsset = isWebGeneratorTarget
    && !processedCssAssetKnown
    && cachedSkipProcessedCssAsset === undefined
    && cssHandlerOptionsForProcessedAsset.isMainChunk
    && webpackSourceCandidateSet !== undefined
    && (
      hasMissingRuntimeCandidates(processedLoaderGeneratedCss?.classSet, webpackSourceCandidateSet)
      || hasMissingRuntimeCandidates(
        resolveGeneratedCssRuntimeCandidates(
          readCurrentProcessedRawSource(),
          processedLoaderGeneratedCss?.classSet,
        ),
        webpackSourceCandidateSet,
      )
    )
  if (cachedSkipProcessedCssAsset !== undefined) {
    hasGeneratedCssMarker = cachedSkipProcessedCssAsset && cssHandlerOptionsForProcessedAsset.isMainChunk
    hasTailwindGeneratedAssetCss = hasGeneratedCssMarker
  }
  else {
    const source = readCurrentProcessedRawSource()
    hasGeneratedCssMarker = hasBundlerGeneratedCssMarker(source)
    hasTailwindGeneratedAssetCss = hasTailwindGeneratedCss(source)
      || hasTailwindGeneratedCssMarkers(source)
  }
  const hasProcessedAssetTailwindDirectives = () => {
    const source = readCurrentProcessedRawSource()
    return hasTailwindRootDirectives(source, { importFallback: true })
      || hasTailwindSourceDirectives(source, { importFallback: true })
      || hasTailwindApplyDirective(source)
  }
  const shouldForceConfiguredMainCssGeneration = cssHandlerOptionsForProcessedAsset.isMainChunk
    && hasConfiguredTailwindV4SourceRoots()
    && !hasGeneratedCssMarker
    && (
      configuredMainCssEntryFiles.length > 0
      || shouldRegenerateProcessedTailwindV4SourceCss
      || hasProcessedAssetTailwindDirectives()
    )
  const hasProcessedMainAssetUserCss = cachedSkipProcessedCssAsset === undefined
    && cssHandlerOptionsForProcessedAsset.isMainChunk
    && (hasGeneratedCssMarker || hasTailwindGeneratedAssetCss)
    && createWebpackUserCssSourceAppend(
      [...cssSources.entries()].map(([sourceFile, source]) => ({
        ...source,
        file: sourceFile,
      })),
      readCurrentProcessedRawSource(),
    ) !== undefined
  const hasProcessedLoaderGeneratedUserCss = cachedSkipProcessedCssAsset === undefined
    && processedLoaderGeneratedCss !== undefined
    && hasAdditionalWebpackAssetUserCssMarkers(
      processedLoaderGeneratedCss.css,
      readCurrentProcessedRawSource(),
    )
  const shouldFinalizeProcessedWebCssAsset = isWebGeneratorTarget
    && !shouldForceConfiguredMainCssGeneration
    && !shouldRegenerateProcessedTailwindV4SourceCss
    && hasTailwindSourceDirectives(readCurrentProcessedRawSource(), { importFallback: true })
  const shouldPreserveFinalWebCssAsset = isWebGeneratorTarget
    && processedSourceFile === undefined
    && !shouldForceConfiguredMainCssGeneration
    && (hasGeneratedCssMarker || hasTailwindGeneratedAssetCss)
  const shouldSkipKnownProcessedCssAsset = !shouldForceConfiguredMainCssGeneration
    && !shouldRegenerateProcessedTailwindV4SourceCss
    && !shouldRegenerateStaleProcessedWebCssAsset
    && (
      processedCssAssetKnown
      || isWebpackProcessedCssAsset?.(file, readCurrentProcessedRawSource(), processedCssAssetMetadata)
    )
    && !hasProcessedMainAssetUserCss
    && !hasProcessedLoaderGeneratedUserCss
    && (!cssHandlerOptionsForProcessedAsset.isMainChunk || hasGeneratedCssMarker || hasTailwindGeneratedAssetCss)
  const shouldSkipProcessedCssAsset = (
    cachedSkipProcessedCssAsset
    ?? (shouldFinalizeProcessedWebCssAsset || shouldPreserveFinalWebCssAsset || shouldSkipKnownProcessedCssAsset)
  )
  if (processedCssAssetKnown && cachedSkipProcessedCssAsset === undefined && !shouldFinalizeProcessedWebCssAsset && !shouldPreserveFinalWebCssAsset) {
    processedCssAssetSkipDecisionCache.set(processedCssDecisionCacheKey, shouldSkipProcessedCssAsset === true)
  }
  if (shouldSkipProcessedCssAsset) {
    const hashKey = `${file}:asset`
    const sourceHash = processedAssetSourceHash
    rememberProcessCacheKey(file, hashKey)
    await enqueueTask(async () => {
      await processCachedTask({
        cache: compilerOptions.cache,
        cacheKey: file,
        hashKey,
        rawSource: chunkHash === undefined && !processedCssAssetKnown
          ? readCurrentProcessedRawSource()
          : undefined,
        hash: createRuntimeAwareCssHash(
          chunkHash,
          sourceHash,
          `${createRuntimeSetHash(getGeneratorRuntimeSet())}:${runtimeAffectingSourceHash}:${webpackSourceCandidates?.signatureHash ?? 'source-candidates:0'}:${webpackSourceCandidateValueSignature}:${cssSourceTraceSignature}`,
        ),
        applyResult(source, { cacheHit }) {
          updateAssetIfChanged(file, source, {
            compare: !cacheHit,
            notifyUpdate: !cacheHit,
          })
        },
        onCacheHit() {
          debug('css webpack-loader-pipeline cache hit: %s', file)
        },
        transform: async () => {
          const source = readCurrentProcessedRawSource()
          const missingProcessedLoaderGeneratedCss = isWebGeneratorTarget && processedLoaderGeneratedCss
            ? filterExistingCssRules(
                source,
                stripBundlerGeneratedCssMarkers(processedLoaderGeneratedCss.css),
              )
            : ''
          const sourceWithLoaderGeneratedCss = missingProcessedLoaderGeneratedCss.trim().length === 0
            ? source
            : createWebpackGeneratorUserCssSourceAppend(
              { css: source, processed: true },
              { css: missingProcessedLoaderGeneratedCss, processed: true },
            )!.css
          const processedBareSelectorSourceCss = processedSourceCss
            ?? (hasTailwindGeneratedAssetCss ? removeWebpackTailwindGeneratedAssetCss(sourceWithLoaderGeneratedCss) : undefined)
          const shouldTransformGeneratedAssetCss = hasTailwindGeneratedAssetCss
            && (
              !hasGeneratedCssMarker
              || (
                !isWebGeneratorTarget
                && hasDeferredWebpackGeneratedCss(
                  source,
                  [...generatedCssSources.values()].map(item => item.classSet),
                )
              )
            )
          const handledCss = shouldTransformGeneratedAssetCss
            ? isWebGeneratorTarget
              ? sourceWithLoaderGeneratedCss
              : (await compilerOptions.styleHandler(
                  sourceWithLoaderGeneratedCss,
                  cssHandlerOptionsForProcessedAsset,
                )).css
            : sourceWithLoaderGeneratedCss
          const nextCss = stripTrailingLineWhitespace(finalizeCssAssetSource(handledCss, {
            cssPreflight: cssHandlerOptionsForProcessedAsset.isMainChunk,
            generatedCss: hasGeneratedCssMarker || hasTailwindGeneratedAssetCss,
          }))
          const processedSourceBareUserCss = isWebGeneratorTarget || processedBareSelectorSourceCss === undefined
            ? undefined
            : createWebpackGeneratorUserCssSourceAppend({
                css: collectWebpackBareSelectorUserCss(processedBareSelectorSourceCss),
                processed: false,
              })
          const finalizedProcessedSourceBareUserCss = processedSourceBareUserCss === undefined
            ? ''
            : finalizeCssAssetSource(processedSourceBareUserCss.css, {
                cssPreflight: false,
                generatedCss: false,
              })
          const missingProcessedSourceBareUserCss = finalizedProcessedSourceBareUserCss.trim().length === 0
            ? ''
            : filterExistingCssRules(nextCss, finalizedProcessedSourceBareUserCss)
          const css = missingProcessedSourceBareUserCss.trim().length === 0
            ? nextCss
            : createWebpackGeneratorUserCssSourceAppend(
              {
                css: nextCss,
                processed: true,
              },
              {
                css: missingProcessedSourceBareUserCss,
                processed: true,
              },
            )!.css
          debug('css skip webpack-loader-pipeline asset: %s', file)
          return {
            result: new ConcatSource(finalizeTracedCss(css, cssHandlerOptionsForProcessedAsset, { finalized: true })),
          }
        },
      })
    }, cssTaskFactories, 'tasks.css')
    return true
  }
  const currentRawSource = readRawSource()
  if (isWebpackCssLoaderRuntimeSource(currentRawSource)) {
    const hashKey = `${file}:asset`
    rememberProcessCacheKey(file, hashKey)
    await enqueueTask(async () => {
      await processCachedTask({
        cache: compilerOptions.cache,
        cacheKey: file,
        hashKey,
        rawSource: currentRawSource,
        hash: createRuntimeAwareCssHash(
          chunkHash,
          compilerOptions.cache.computeHash(currentRawSource),
          'webpack-css-loader-runtime',
        ),
        applyResult(source, { cacheHit }) {
          updateAssetIfChanged(file, source, {
            compare: !cacheHit,
            notifyUpdate: !cacheHit,
          })
        },
        onCacheHit() {
          debug('css-loader runtime cache hit: %s', file)
        },
        transform: async () => ({
          result: new ConcatSource(currentRawSource),
        }),
      })
    }, cssTaskFactories, 'tasks.css')
    return true
  }
  return false
}
