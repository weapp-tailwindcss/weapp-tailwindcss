import type { ComparableCssCoverage } from '@weapp-tailwindcss/postcss/transform'
import type { OutputBundle } from 'rollup'
import type { CssAssetMarkerMatcher, CssAssetResultRecorder } from './markers-imports'
import { collectRootScopedComparableCssCoverage, removeCssCoveredByRootStyleSources } from '@weapp-tailwindcss/postcss/transform'
import { parseBundlerGeneratedCssMarkerBlocks, stripBundlerGeneratedCssMarkers } from '../../shared/generated-css-marker'
import { isSubpackageOutputFile } from '../generate-bundle/subpackages'
import { collectRootStyleBundleCssSources, getAssetFile, isCssOutputFile, isMatchingGeneratedCssMarkerFile, normalizeMarkerOutputFile, readAssetSource } from './markers-imports'
import { hasVueScopedAttr } from './scoped-tailwind-noise'
import { isMiniProgramStyleOutputFile, isRootStyleOutputFile } from './style-files'

export { normalizeCssSignatureValue } from './scoped-tailwind-noise'

export { collectRootScopedComparableCssCoverage, type ComparableCssCoverage, isRuleCoveredByRootCss, removeScopedTailwindPreflightCss } from '@weapp-tailwindcss/postcss/transform'

export function prepareImportedCssCoverage(importedCssSources: string[]) {
  const sources = importedCssSources
    .map(source => stripBundlerGeneratedCssMarkers(source).trim())
    .filter(Boolean)
  if (sources.length === 0) {
    return undefined
  }
  return {
    coverage: collectRootScopedComparableCssCoverage(sources),
    sources,
  }
}

export function collectSingleViteGeneratedCssMarkerFile(rawSource: string) {
  const blocks = parseBundlerGeneratedCssMarkerBlocks(rawSource)
    .filter(block => block.bundler === 'vite')
  if (blocks.length !== 1) {
    return undefined
  }
  const file = blocks[0]?.file
  return typeof file === 'string' && file.length > 0 ? file : undefined
}

export function shouldFilterRootGeneratedCssMarkerForScopedAsset(
  targetFile: string,
  markerFile: string,
  resolveViteProcessedCssOutputFile: ((file: string) => string | undefined) | undefined,
) {
  const resolvedTargetFile = normalizeMarkerOutputFile(targetFile, resolveViteProcessedCssOutputFile)
  const resolvedMarkerFile = normalizeMarkerOutputFile(markerFile, resolveViteProcessedCssOutputFile)
  if (
    !isRootStyleOutputFile(resolvedMarkerFile)
    || isRootStyleOutputFile(resolvedTargetFile)
  ) {
    return false
  }
  return !isMatchingGeneratedCssMarkerFile(targetFile, markerFile, resolveViteProcessedCssOutputFile)
}

export function removeCssCoveredByRootStyleBundleSources(bundle: OutputBundle, file: string, css: string) {
  return removeCssCoveredByRootStyleSources(css, collectRootStyleBundleCssSources(bundle, file))
}

export function removeCssCoveredByRootStyleAssets(
  bundle: OutputBundle,
  options: {
    cssMatcher: (file: string) => boolean
    debug?: ((format: string, ...args: unknown[]) => void) | undefined
    includeTailwindGeneratedCssAssets?: boolean | undefined
    isViteProcessedCssAsset?: CssAssetMarkerMatcher | undefined
    onUpdate?: ((file: string, original: string, generated: string) => void) | undefined
    recordCssAssetResult?: CssAssetResultRecorder | undefined
    subpackageRoots?: Set<string> | undefined
  },
) {
  let updated = 0
  let previousRootSources: string[] | undefined
  let rootCoverage: ComparableCssCoverage | undefined
  for (const [bundleFile, output] of Object.entries(bundle)) {
    if (output.type !== 'asset') {
      continue
    }
    const file = getAssetFile(bundleFile, output)
    const rawSource = readAssetSource(output)
    const hasScopedCss = hasVueScopedAttr(rawSource)
    const hasTailwindGeneratedCss = /tailwindcss v\d/i.test(rawSource)
    const shouldIncludeTailwindGeneratedCssAsset = options.includeTailwindGeneratedCssAssets === true
      && hasTailwindGeneratedCss
      && isCssOutputFile(file)
      && !isMiniProgramStyleOutputFile(file)
    if (
      !(options.cssMatcher(file) || (hasScopedCss && isCssOutputFile(file)) || shouldIncludeTailwindGeneratedCssAsset)
      || rawSource.trim().length === 0
      || isRootStyleOutputFile(file)
      || (
        options.isViteProcessedCssAsset?.(output, file) === true
        && !hasScopedCss
        && !shouldIncludeTailwindGeneratedCssAsset
      )
      || (
        options.subpackageRoots != null
        && isSubpackageOutputFile(file, options.subpackageRoots)
      )
    ) {
      continue
    }
    const rootSources = collectRootStyleBundleCssSources(bundle, file)
    // 只在本轮产物处理内复用；回调修改根样式时必须重新建立覆盖索引。
    if (!previousRootSources
      || rootSources.length !== previousRootSources.length
      || rootSources.some((source, index) => source !== previousRootSources?.[index])) {
      previousRootSources = rootSources
      rootCoverage = collectRootScopedComparableCssCoverage(rootSources)
    }
    const nextCss = removeCssCoveredByRootStyleSources(rawSource, rootSources, rootCoverage)
    if (nextCss === rawSource) {
      continue
    }
    output.source = nextCss
    options.recordCssAssetResult?.(file, nextCss)
    options.onUpdate?.(file, rawSource, nextCss)
    options.debug?.('remove root-covered css rules from scoped asset: %s bytes=%d', file, nextCss.length)
    updated++
  }
  return updated
}
