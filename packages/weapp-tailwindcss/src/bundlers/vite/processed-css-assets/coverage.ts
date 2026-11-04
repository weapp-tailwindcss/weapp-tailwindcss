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
    coverage: collectRootScopedComparableCssCoverage(sources, { exactOnly: true }),
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

export function removeCssCoveredByRootStyleBundleSources(bundle: OutputBundle, file: string, css: string, options?: { preserveSkylineTypography?: boolean }) {
  return removeCssCoveredByRootStyleSources(css, collectRootStyleBundleCssSources(bundle, file), undefined, options)
}

interface RemoveRootCoveredCssAssetOptions {
  cssMatcher: (file: string) => boolean
  debug?: ((format: string, ...args: unknown[]) => void) | undefined
  includeTailwindGeneratedCssAssets?: boolean | undefined
  isViteProcessedCssAsset?: CssAssetMarkerMatcher | undefined
  onUpdate?: ((file: string, original: string, generated: string) => void) | undefined
  recordCssAssetResult?: CssAssetResultRecorder | undefined
  subpackageRoots?: Set<string> | undefined
  preserveSkylineTypography?: boolean | undefined
}

function resolveRootCoverageAsset(bundleFile: string, output: OutputBundle[string], options: RemoveRootCoveredCssAssetOptions) {
  if (output.type !== 'asset') {
    return
  }
  const file = getAssetFile(bundleFile, output)
  const rawSource = readAssetSource(output)
  const hasScopedCss = hasVueScopedAttr(rawSource)
  const shouldIncludeTailwindGeneratedCssAsset = options.includeTailwindGeneratedCssAssets === true
    && /tailwindcss v\d/i.test(rawSource)
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
    return
  }
  return { file, rawSource, hasScopedCss }
}

export function removeCssCoveredByRootStyleAssets(bundle: OutputBundle, options: RemoveRootCoveredCssAssetOptions) {
  let updated = 0
  let previousRootSources: string[] | undefined
  let rootCoverage: ComparableCssCoverage | undefined
  const assets = Object.entries(bundle)
  // 同批已有 scoped 消费方时一次建全；普通资产先处理不能导致根样式再解析一遍。
  const needsFullCoverage = assets.some(([file, output]) => resolveRootCoverageAsset(file, output, options)?.hasScopedCss)
  for (const [bundleFile, output] of assets) {
    const asset = resolveRootCoverageAsset(bundleFile, output, options)
    if (!asset || output.type !== 'asset') {
      continue
    }
    const { file, rawSource, hasScopedCss } = asset
    const rootSources = collectRootStyleBundleCssSources(bundle, file)
    // 只在本轮产物处理内复用；回调修改根样式时必须重新建立覆盖索引。
    if (!previousRootSources
      || rootSources.length !== previousRootSources.length
      || rootSources.some((source, index) => source !== previousRootSources?.[index])) {
      previousRootSources = rootSources
      rootCoverage = collectRootScopedComparableCssCoverage(rootSources, { exactOnly: !hasScopedCss && !needsFullCoverage })
    }
    const nextCss = removeCssCoveredByRootStyleSources(rawSource, rootSources, rootCoverage, { preserveSkylineTypography: options.preserveSkylineTypography === true })
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
