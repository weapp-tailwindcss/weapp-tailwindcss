import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'
import type { GeneratorSourceRecord } from './metadata'
import type { GeneratorSourceRuntimeState, GeneratorSourceSelectionOptions, SourceStyleMatchOptions, TailwindV4SourceOptions } from './types'
import type { NormalizedWeappTailwindcssGeneratorOptions, TailwindResolvedSource } from '@/generator/index'
import type { UndefinedOptional } from '@/utils/object'
import { resolveTailwindV4SourceOptionsFromRuntime } from '@/generator/index'
import { omitUndefined } from '@/utils/object'
import { prependConfigDirective } from '../config-directive'
import { hasTailwindApplyDirective, hasTailwindRootDirectives, hasTailwindSourceDirectives, resolveCssEntrySource } from '../directives'
import { hasTailwindGeneratedCss, hasTailwindGeneratedCssMarkers } from '../markers'
import { resolveSourceSideCssEntrySource } from '../source-files'
import { canResolveSourceSideCssEntry, hasConfiguredTailwindV4CssSource, mergeCssSources, normalizeResolvedTailwindV4SourceConfig, normalizeTailwindV4CssSourceConfigs, resolveTailwindV4CssEntrySource } from './configuration'
import { createGeneratorSourceRecord, getGeneratorSourceMetadata, withGeneratorSourceMetadata } from './metadata'
import { resolveCssHandlerSourceOptions, resolveCssSourceBase, resolvePostcssSourceFile } from './postcss-source'
import { resolveGeneratorSource } from './resolve-source'
import { createTailwindV4CssSourceResolver, resolveCandidateMatchedTailwindV4CssEntry, resolveCandidateMatchedTailwindV4CssSource, resolveSingleTailwindV4CssSource, resolveTailwindV4SourceSideEntrySource } from './single-source'
import { resolveMatchingTailwindV4CssEntry, resolveMatchingTailwindV4CssSource } from './source-matching'

async function resolveGeneratorResolvedSources(
  majorVersion: number | undefined,
  runtimeState: GeneratorSourceRuntimeState,
  rawSource: string,
  file: string,
  cssHandlerOptions: IStyleHandlerOptions,
  generatorOptions?: NormalizedWeappTailwindcssGeneratorOptions,
  selectionOptions?: GeneratorSourceSelectionOptions,
): Promise<TailwindResolvedSource[]> {
  const ownedSources = resolveCssHandlerSourceOptions(cssHandlerOptions)?.cssSources
  if (ownedSources?.length) {
    const sourceOptions = { ...resolveTailwindV4SourceOptionsFromRuntime(runtimeState.tailwindRuntime), cssEntries: [], cssSources: ownedSources }
    return Promise.all(ownedSources.map(async (source, index) => {
      const resolved = await resolveSingleTailwindV4CssSource(source, sourceOptions, { index, matched: true, primary: index === 0 })
      return normalizeResolvedTailwindV4SourceConfig(
        withGeneratorSourceMetadata(
          generatorOptions?.config ? { ...resolved, css: prependConfigDirective(resolved.css, generatorOptions.config) } : resolved,
          {
            ...getGeneratorSourceMetadata(resolved),
            isolateCssSource: ownedSources.length > 1 || /source\(\s*none\s*\)/i.test(source.css),
          },
        ),
        source.file,
        sourceOptions,
      )
    }))
  }
  const base = resolveCssSourceBase(file, cssHandlerOptions)
  const cssEntrySource = resolveCssEntrySource(rawSource, base, {
    importFallback: generatorOptions?.importFallback ?? false,
    removeConfig: false,
  })
  if (
    (cssEntrySource && !cssHandlerOptions.isMainChunk)
    || (
      !cssHandlerOptions.isMainChunk
      && hasTailwindApplyDirective(rawSource)
      && !hasTailwindRootDirectives(rawSource, { importFallback: generatorOptions?.importFallback ?? false })
    )
  ) {
    const resolved = await resolveGeneratorSource(majorVersion, runtimeState, rawSource, file, cssHandlerOptions, generatorOptions, selectionOptions)
    return resolved ? [resolved] : []
  }

  let sourceOptions: TailwindV4SourceOptions
  try {
    const sourceOptionsFromRuntime = resolveTailwindV4SourceOptionsFromRuntime(runtimeState.tailwindRuntime)
    const cssEntries = selectionOptions?.cssEntries ?? sourceOptionsFromRuntime.cssEntries
    const runtimeCssSources = selectionOptions?.cssEntries ? undefined : sourceOptionsFromRuntime.cssSources
    sourceOptions = omitUndefined<TailwindV4SourceOptions>({
      ...sourceOptionsFromRuntime,
      sourceFile: resolvePostcssSourceFile(cssHandlerOptions),
      ...resolveCssHandlerSourceOptions(cssHandlerOptions),
      cssEntries,
      cssSources: mergeCssSources(
        mergeCssSources(runtimeCssSources, selectionOptions?.cssSources),
        undefined,
      ),
    } satisfies UndefinedOptional<TailwindV4SourceOptions>) as TailwindV4SourceOptions
  }
  catch {
    const resolved = await resolveGeneratorSource(majorVersion, runtimeState, rawSource, file, cssHandlerOptions, generatorOptions, selectionOptions)
    return resolved ? [resolved] : []
  }

  const matchedCssEntrySource = sourceOptions
    ? await resolveMatchingTailwindV4CssEntry(rawSource, file, sourceOptions)
    : undefined
  if (matchedCssEntrySource) {
    const source = generatorOptions?.config
      ? {
          ...matchedCssEntrySource,
          css: prependConfigDirective(matchedCssEntrySource.css, generatorOptions.config),
        }
      : matchedCssEntrySource
    return [
      normalizeResolvedTailwindV4SourceConfig(
        source,
        getGeneratorSourceMetadata(matchedCssEntrySource)?.matchedCssSourceFile,
        sourceOptions,
      ),
    ]
  }
  const sourceSideEntrySource = canResolveSourceSideCssEntry(file, cssHandlerOptions, sourceOptions)
    ? resolveSourceSideCssEntrySource(file, sourceOptions as SourceStyleMatchOptions, { removeConfig: false })
    : undefined
  const sourceSideCssSource = await resolveTailwindV4SourceSideEntrySource(
    sourceSideEntrySource,
    sourceOptions,
    generatorOptions,
    file,
  )
  if (sourceSideCssSource) {
    return [sourceSideCssSource]
  }
  const matchedCssSource = await resolveMatchingTailwindV4CssSource(rawSource, file, cssHandlerOptions, sourceOptions, selectionOptions)
  const candidateMatchedCssEntrySource = await resolveCandidateMatchedTailwindV4CssEntry(
    sourceOptions,
    selectionOptions,
  )
  const candidateMatchedCssSource = await resolveCandidateMatchedTailwindV4CssSource(
    rawSource,
    cssHandlerOptions,
    sourceOptions,
    selectionOptions,
  )
  const preferredCssEntrySource = matchedCssEntrySource ?? matchedCssSource ?? candidateMatchedCssEntrySource ?? candidateMatchedCssSource
  if (preferredCssEntrySource) {
    const source = generatorOptions?.config
      ? {
          ...preferredCssEntrySource,
          css: prependConfigDirective(preferredCssEntrySource.css, generatorOptions.config),
        }
      : preferredCssEntrySource
    return [
      normalizeResolvedTailwindV4SourceConfig(
        source,
        getGeneratorSourceMetadata(preferredCssEntrySource)?.matchedCssSourceFile,
        sourceOptions,
      ),
    ]
  }

  if (!sourceOptions.cssEntries || sourceOptions.cssEntries.length <= 1) {
    if (cssHandlerOptions.isMainChunk && sourceOptions.cssEntries?.length === 1) {
      return [
        await resolveTailwindV4CssEntrySource(
          sourceOptions.cssEntries[0]!,
          normalizeTailwindV4CssSourceConfigs(sourceOptions),
          { index: 0 },
        ).then(source => generatorOptions?.config
          ? {
              ...source,
              css: prependConfigDirective(source.css, generatorOptions.config),
            }
          : source),
      ]
    }
    if (sourceOptions.cssSources?.length === 1) {
      return [
        normalizeResolvedTailwindV4SourceConfig(
          await createTailwindV4CssSourceResolver(sourceOptions, generatorOptions)(sourceOptions.cssSources[0]!, 0),
          sourceOptions.cssSources[0]?.file,
          sourceOptions,
        ),
      ]
    }
    const resolved = await resolveGeneratorSource(majorVersion, runtimeState, rawSource, file, cssHandlerOptions, generatorOptions, selectionOptions)
    return resolved ? [resolved] : []
  }

  if (
    cssHandlerOptions.isMainChunk
    && !cssEntrySource
    && !hasTailwindGeneratedCss(rawSource)
    && !hasTailwindGeneratedCssMarkers(rawSource)
    && !hasTailwindSourceDirectives(rawSource, {
      importFallback: generatorOptions?.importFallback ?? false,
    })
    && !rawSource.includes('weapp-tailwindcss generator-placeholder')
    && !hasConfiguredTailwindV4CssSource(sourceOptions)
  ) {
    const resolved = await resolveGeneratorSource(majorVersion, runtimeState, rawSource, file, cssHandlerOptions, generatorOptions, selectionOptions)
    return resolved ? [resolved] : []
  }

  const normalizedCssSourceOptions = normalizeTailwindV4CssSourceConfigs(sourceOptions)
  const cssEntrySources = await Promise.all(sourceOptions.cssEntries.map((cssEntry, index) =>
    resolveTailwindV4CssEntrySource(cssEntry, normalizedCssSourceOptions, { index }).then(source => generatorOptions?.config
      ? {
          ...source,
          css: prependConfigDirective(source.css, generatorOptions.config),
        }
      : source),
  ))
  const cssSources = sourceOptions.cssSources?.length
    ? await Promise.all(sourceOptions.cssSources.map(createTailwindV4CssSourceResolver(sourceOptions, generatorOptions)))
    : []
  return [
    ...cssEntrySources,
    ...cssSources,
  ]
}

export async function resolveGeneratorSources(
  majorVersion: number | undefined,
  runtimeState: GeneratorSourceRuntimeState,
  rawSource: string,
  file: string,
  cssHandlerOptions: IStyleHandlerOptions,
  generatorOptions?: NormalizedWeappTailwindcssGeneratorOptions,
  selectionOptions?: GeneratorSourceSelectionOptions,
): Promise<GeneratorSourceRecord[]> {
  const sources = await resolveGeneratorResolvedSources(
    majorVersion,
    runtimeState,
    rawSource,
    file,
    cssHandlerOptions,
    generatorOptions,
    selectionOptions,
  )
  return sources.map(createGeneratorSourceRecord)
}
