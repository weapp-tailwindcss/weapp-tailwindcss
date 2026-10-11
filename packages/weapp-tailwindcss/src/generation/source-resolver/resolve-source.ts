import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'
import type { SourceSideCssEntrySource } from '../source-files'
import type { GeneratorSourceRuntimeState, GeneratorSourceSelectionOptions, SourceStyleMatchOptions, TailwindV4CssSource, TailwindV4SourceOptions } from './types'
import type { NormalizedWeappTailwindcssGeneratorOptions } from '@/generator/index'
import path from 'node:path'
import { resolveTailwindV4Source, resolveTailwindV4SourceFromRuntime } from '@/generator/index'
import { omitUndefined } from '@/utils/object'
import { normalizeConfigDirective, prependConfigDirective } from '../config-directive'
import { hasTailwindApplyDirective, hasTailwindRootDirectives, resolveCssEntrySource } from '../directives'
import { hasTailwindGeneratedCss, hasTailwindGeneratedCssMarkers } from '../markers'
import { resolveSourceSideCssEntrySource } from '../source-files'
import { isSfcStyleSourceRequest } from '../style-requests'
import { createTailwindV4ApplyReferenceSource, createTailwindV4SourceReferenceSource } from './apply-reference'
import { resolveExistingConfigPath } from './config'
import { canResolveSourceSideCssEntry, createCssEntrySources, createSingleTailwindV4SourceOptions, hasConfiguredTailwindV4CssSource, mergeCssSources, normalizeTailwindV4CssSourceConfigs, resolveTailwindV4CssEntrySource, resolveUniqueTailwindV4CssConfig, shouldResolveSourceSideCssEntry, tryResolveTailwindV4SourceOptions } from './configuration'
import { resolveCssHandlerSourceOptions, resolveCssSourceBase, resolvePostcssSourceFile } from './postcss-source'
import { resolveCandidateMatchedTailwindV4CssEntry, resolveCandidateMatchedTailwindV4CssSource, resolveSingleTailwindV4CssSource, resolveTailwindV4SourceSideEntrySource } from './single-source'
import { resolveMatchingTailwindV4CssEntry, resolveMatchingTailwindV4CssSource } from './source-matching'

export async function resolveGeneratorSource(
  _majorVersion: number | undefined,
  runtimeState: GeneratorSourceRuntimeState,
  rawSource: string,
  file: string,
  cssHandlerOptions: IStyleHandlerOptions,
  generatorOptions?: NormalizedWeappTailwindcssGeneratorOptions,
  selectionOptions?: GeneratorSourceSelectionOptions,
) {
  const base = resolveCssSourceBase(file, cssHandlerOptions)
  const cssEntrySource = resolveCssEntrySource(rawSource, base, {
    importFallback: generatorOptions?.importFallback ?? false,
    removeConfig: false,
  })
  const applyEntrySource = hasTailwindApplyDirective(rawSource)
    ? {
        base,
        css: rawSource,
      } as SourceSideCssEntrySource
    : undefined
  const sourceOptions = tryResolveTailwindV4SourceOptions(runtimeState)
  const resolvedSourceOptions: TailwindV4SourceOptions | undefined = sourceOptions
    ? omitUndefined<TailwindV4SourceOptions>({
        ...sourceOptions,
        sourceFile: sourceOptions.sourceFile ?? resolvePostcssSourceFile(cssHandlerOptions),
        ...resolveCssHandlerSourceOptions(cssHandlerOptions),
        cssEntries: selectionOptions?.cssEntries ?? sourceOptions.cssEntries,
        cssSources: mergeCssSources(
          mergeCssSources(sourceOptions.cssSources, selectionOptions?.cssSources),
          sourceOptions.cssSources?.length || selectionOptions?.cssSources?.length
            ? undefined
            : createCssEntrySources(selectionOptions?.cssEntries ?? sourceOptions.cssEntries) as TailwindV4CssSource[] | undefined,
        ),
      })
    : undefined
  const normalizedSourceOptions = resolvedSourceOptions
    ? normalizeTailwindV4CssSourceConfigs(resolvedSourceOptions)
    : undefined
  if (applyEntrySource && !cssHandlerOptions.isMainChunk && !hasTailwindRootDirectives(rawSource, { importFallback: generatorOptions?.importFallback ?? false })) {
    const config = generatorOptions?.config
      ?? (normalizedSourceOptions ? resolveUniqueTailwindV4CssConfig(normalizedSourceOptions) : undefined)
    const css = createTailwindV4ApplyReferenceSource(
      normalizeConfigDirective(
        prependConfigDirective(applyEntrySource.css, config),
        undefined,
      ),
      normalizedSourceOptions ?? {},
    )
    return resolveTailwindV4Source(createSingleTailwindV4SourceOptions(normalizedSourceOptions ?? {}, {
      base: applyEntrySource.base,
      css,
    }))
  }
  const shouldPreferSourceSideEntry = shouldResolveSourceSideCssEntry(rawSource)
    || (
      Boolean(cssEntrySource?.css.includes('weapp-tailwindcss generator-placeholder'))
      && (sourceOptions?.cssEntries?.length ?? 0) <= 1
    )
  const sourceSideEntrySource = normalizedSourceOptions
    && (shouldPreferSourceSideEntry || normalizedSourceOptions.sourceFile !== undefined)
    && canResolveSourceSideCssEntry(file, cssHandlerOptions, normalizedSourceOptions)
    ? resolveSourceSideCssEntrySource(file, normalizedSourceOptions as SourceStyleMatchOptions, { removeConfig: false })
    : undefined
  const shouldPreferMatchedSourceSideCssSource = sourceSideEntrySource?.file
    && (
      sourceOptions?.cssEntries?.some(cssEntry =>
        path.resolve(cssEntry.replace(/[?#].*$/, '')) === path.resolve(sourceSideEntrySource.file!),
      )
      || (
        isSfcStyleSourceRequest(file)
        && sourceOptions?.cssSources?.some(cssSource =>
          typeof cssSource.file === 'string'
          && path.resolve(cssSource.file.replace(/[?#].*$/, '')) === path.resolve(sourceSideEntrySource.file!),
        )
      )
    )
  const sourceSideCssSource = normalizedSourceOptions && shouldPreferMatchedSourceSideCssSource
    ? await resolveTailwindV4SourceSideEntrySource(
        sourceSideEntrySource,
        normalizedSourceOptions,
        generatorOptions,
        file,
        rawSource,
      )
    : undefined
  if (sourceSideCssSource) {
    return sourceSideCssSource
  }
  const matchedCssEntrySource = normalizedSourceOptions
    ? await resolveMatchingTailwindV4CssEntry(rawSource, file, normalizedSourceOptions)
    : undefined
  const matchedCssSource = normalizedSourceOptions && !matchedCssEntrySource
    ? await resolveMatchingTailwindV4CssSource(rawSource, file, cssHandlerOptions, normalizedSourceOptions, selectionOptions)
    : undefined
  const candidateMatchedCssEntrySource = normalizedSourceOptions && !matchedCssEntrySource
    ? await resolveCandidateMatchedTailwindV4CssEntry(normalizedSourceOptions, selectionOptions)
    : undefined
  const candidateMatchedCssSource = normalizedSourceOptions && !matchedCssEntrySource
    ? await resolveCandidateMatchedTailwindV4CssSource(rawSource, cssHandlerOptions, normalizedSourceOptions, selectionOptions)
    : undefined
  const singleConfiguredCssSource = normalizedSourceOptions?.cssSources?.length === 1
    ? await resolveSingleTailwindV4CssSource(normalizedSourceOptions.cssSources[0]!, normalizedSourceOptions, { index: 0, matched: true })
    : undefined
  const canResolveCombinedConfiguredCssSources = (normalizedSourceOptions?.cssSources?.length ?? 0) <= 1
    || hasTailwindGeneratedCss(rawSource)
  const configuredCssSource = normalizedSourceOptions
    && hasConfiguredTailwindV4CssSource(normalizedSourceOptions)
    && hasTailwindGeneratedCssMarkers(rawSource)
    ? matchedCssSource
    ?? candidateMatchedCssSource
    ?? singleConfiguredCssSource
    ?? (canResolveCombinedConfiguredCssSources ? await resolveTailwindV4Source(normalizedSourceOptions) : undefined)
    : undefined
  if (configuredCssSource) {
    return generatorOptions?.config
      ? {
          ...configuredCssSource,
          css: prependConfigDirective(configuredCssSource.css, generatorOptions.config),
        }
      : configuredCssSource
  }
  const mainCssEntrySource = normalizedSourceOptions
    && cssHandlerOptions.isMainChunk
    && normalizedSourceOptions.cssEntries?.length === 1
    ? await resolveTailwindV4CssEntrySource(normalizedSourceOptions.cssEntries[0]!, normalizedSourceOptions)
    : undefined
  const preferredCssEntrySource = matchedCssEntrySource ?? matchedCssSource ?? candidateMatchedCssEntrySource ?? candidateMatchedCssSource ?? mainCssEntrySource ?? singleConfiguredCssSource
  if (preferredCssEntrySource) {
    return generatorOptions?.config
      ? {
          ...preferredCssEntrySource,
          css: prependConfigDirective(preferredCssEntrySource.css, generatorOptions.config),
        }
      : preferredCssEntrySource
  }

  const resolvedEntrySource = sourceSideEntrySource ?? cssEntrySource ?? applyEntrySource
  if (!resolvedEntrySource) {
    const source = await resolveTailwindV4SourceFromRuntime(runtimeState.tailwindRuntime)
    return generatorOptions?.config
      ? {
          ...source,
          css: prependConfigDirective(source.css, generatorOptions.config),
        }
      : source
  }
  const config = resolveExistingConfigPath(
    resolvedEntrySource.config,
    resolvedEntrySource.configRequest,
    file,
    omitUndefined({
      ...(resolvedSourceOptions ?? {}),
      sourceFile: (resolvedEntrySource as SourceSideCssEntrySource).file
        ?? resolvedSourceOptions?.sourceFile
        ?? resolvePostcssSourceFile(cssHandlerOptions),
    }),
  )
  const sourceBase = resolvedEntrySource === cssEntrySource && config
    ? path.dirname(config)
    : resolvedEntrySource.base
  const css = createTailwindV4SourceReferenceSource(
    normalizeConfigDirective(
      prependConfigDirective(resolvedEntrySource.css, generatorOptions?.config),
      config,
    ),
    normalizedSourceOptions ?? {},
  )
  return resolveTailwindV4Source(createSingleTailwindV4SourceOptions(normalizedSourceOptions ?? {}, {
    base: sourceBase,
    css,
  }))
}
