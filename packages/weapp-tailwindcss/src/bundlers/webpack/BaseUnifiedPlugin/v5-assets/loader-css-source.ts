import type { sources } from 'webpack'
import type { WebpackCssAssetTaskContext } from './processed-css-task'
import path from 'node:path'
import { hasTailwindGeneratedCss, hasTailwindGeneratedCssMarkers, hasTailwindSourceDirectives } from '../../../../generation/index'
import { hasBundlerGeneratedCssMarker } from '../../../shared/generated-css-marker'
import { resolveTailwindV4EntriesFromCssCached } from '../../../shared/source-scan'
import { shouldConsumeWebpackLoaderGeneratedCss } from './pipeline-helpers'

/** 框架 Source 只属于本轮编译，不得进入按 CSS 文本复用的跨编译缓存。 */
export async function preserveLoaderProcessedWebCssAsset(file: string, originalSource: sources.Source, context: WebpackCssAssetTaskContext) {
  const { isWebGeneratorTarget, getCssHandlerOptions, generatedCssSources, cssSources, webpackSourceCandidates, configuredCssEntryFiles, watchMode, generatorRuntimeSet, transformRuntimeSet, compilation, preserveProcessedWebCssAsset, updateAssetIfChanged } = context
  if (!isWebGeneratorTarget) {
    return false
  }
  const css = originalSource.source().toString()
  const hasMarker = hasBundlerGeneratedCssMarker(css)
  if (!hasMarker && !hasTailwindGeneratedCss(css) && !hasTailwindGeneratedCssMarkers(css)) {
    return false
  }
  const sourceFile = getCssHandlerOptions(file, css).sourceOptions?.sourceFile
  const generated = sourceFile ? generatedCssSources.get(path.resolve(sourceFile)) : undefined
  if (!generated) {
    return false
  }
  const sourceCss = cssSources.get(path.resolve(sourceFile))?.css
  const shouldRegenerateExplicitTailwindV4CssSource = sourceCss !== undefined
    && (hasTailwindSourceDirectives(sourceCss, { importFallback: true }) || sourceCss.includes('@config'))
  const sourceCandidates = shouldRegenerateExplicitTailwindV4CssSource && webpackSourceCandidates?.getSourceCandidatesForEntries
    ? await resolveTailwindV4EntriesFromCssCached(sourceCss, path.dirname(sourceFile))
        .then(resolved => resolved?.entries ? webpackSourceCandidates.getSourceCandidatesForEntries(resolved.entries) : undefined)
    : undefined
  if (!shouldConsumeWebpackLoaderGeneratedCss({
    allowMarkerlessRegistryMatch: configuredCssEntryFiles.length === 1,
    hasBundlerGeneratedCssMarker: hasMarker,
    loaderGeneratedClassSet: generated.classSet,
    sourceCandidates,
    shouldRegenerateExplicitTailwindV4CssSource,
    watchMode,
  })) {
    return false
  }
  for (const candidate of generated.classSet) {
    generatorRuntimeSet.add(candidate)
    transformRuntimeSet.add(candidate)
  }
  for (const dependency of generated.dependencies) {
    compilation.fileDependencies?.add?.(dependency)
  }
  const next = preserveProcessedWebCssAsset(originalSource)
  if (next !== originalSource) {
    updateAssetIfChanged(file, next, { compare: false })
  }
  return true
}
