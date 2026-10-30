import type { sources } from 'webpack'
import type { WebpackGeneratedCssRegistration } from '../../loaders/runtime-registry'
import type { WebpackCssAssetTaskContext } from './processed-css-task'
import path from 'node:path'
import { hasTailwindSourceDirectives } from '../../../../generation/index'
import { hasBundlerGeneratedCssMarker } from '../../../shared/generated-css-marker'
import { resolveTailwindV4EntriesFromCssCached } from '../../../shared/source-scan'
import { isWebpackCssLoaderRuntimeSource } from '../../shared/css-loader-runtime'
import { resolveWebpackGeneratorRawSource, shouldConsumeWebpackLoaderGeneratedCss } from './pipeline-helpers'

/** 复用本轮资产的来源关系与新鲜度判定，不把未绑定的注册表候选提升为已生成类名。 */
export async function resolveWebpackLoaderGeneratedCss(
  file: string,
  css: string,
  context: WebpackCssAssetTaskContext,
): Promise<WebpackGeneratedCssRegistration | undefined> {
  const { configuredCssEntryFiles, cssSources, generatedCssSources, getCssHandlerOptions, watchMode, webpackSourceCandidates } = context
  const cssHandlerOptions = getCssHandlerOptions(file, css)
  if (isWebpackCssLoaderRuntimeSource(resolveWebpackGeneratorRawSource(css, cssHandlerOptions))) {
    return undefined
  }
  const sourceFile = cssHandlerOptions.sourceOptions?.sourceFile
  const generated = sourceFile ? generatedCssSources.get(path.resolve(sourceFile)) : undefined
  if (!generated) {
    return undefined
  }
  const sourceCss = cssSources.get(path.resolve(sourceFile))?.css
  const shouldRegenerateExplicitTailwindV4CssSource = sourceCss !== undefined
    && (hasTailwindSourceDirectives(sourceCss, { importFallback: true }) || sourceCss.includes('@config'))
  const sourceCandidates = shouldRegenerateExplicitTailwindV4CssSource && webpackSourceCandidates?.getSourceCandidatesForEntries
    ? await resolveTailwindV4EntriesFromCssCached(sourceCss, path.dirname(sourceFile))
        .then(resolved => resolved?.entries ? webpackSourceCandidates.getSourceCandidatesForEntries(resolved.entries) : undefined)
    : undefined
  return shouldConsumeWebpackLoaderGeneratedCss({
    allowMarkerlessRegistryMatch: configuredCssEntryFiles.length === 1,
    hasBundlerGeneratedCssMarker: hasBundlerGeneratedCssMarker(css),
    loaderGeneratedClassSet: generated.classSet,
    sourceCandidates,
    shouldRegenerateExplicitTailwindV4CssSource,
    watchMode,
  })
    ? generated
    : undefined
}

/** 先确认本轮 loader 元数据，再处理 HTML/JS；CSS 生成仍在 JS 转译之后执行。 */
export async function collectWebpackLoaderGeneratedCssMetadata(
  entries: Array<[string, Pick<sources.Source, 'source'>]>,
  context: WebpackCssAssetTaskContext,
) {
  const { compilation, generatorRuntimeSet, transformRuntimeSet } = context
  const confirmed = new Map<string, WebpackGeneratedCssRegistration>()
  for (const [file, source] of entries) {
    const generated = await resolveWebpackLoaderGeneratedCss(file, source.source().toString(), context)
    if (!generated) {
      continue
    }
    confirmed.set(file, generated)
    for (const candidate of generated.classSet) {
      generatorRuntimeSet.add(candidate)
      transformRuntimeSet.add(candidate)
    }
    for (const dependency of generated.dependencies) {
      compilation.fileDependencies?.add?.(dependency)
    }
  }
  return confirmed
}
