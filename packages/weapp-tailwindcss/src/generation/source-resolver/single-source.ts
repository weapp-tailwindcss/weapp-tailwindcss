import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'
import type { resolveSourceSideCssEntrySource } from '../source-files'
import type { GeneratorSourceSelectionOptions, TailwindV4CssSource, TailwindV4SourceOptions } from './types'
import type { NormalizedWeappTailwindcssGeneratorOptions, resolveTailwindV4SourceOptionsFromRuntime } from '@/generator/index'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { resolveTailwindV4Source } from '@/generator/index'
import { resolveTailwindV4EntriesFromCss } from '@/project-sources/index'
import { resolveTailwindV4CssSourceBase } from '@/tailwindcss/source-scan'
import { omitUndefined } from '@/utils/object'
import { normalizeConfigDirective, prependConfigDirective } from '../config-directive'
import { createTailwindV4SourceReferenceSource } from './apply-reference'
import { resolveExistingConfigPath } from './config'
import { createSingleTailwindV4SourceOptions, isSameTailwindV4CssSource, normalizeTailwindV4CssSourceConfig, resolveTailwindV4CssEntrySource } from './configuration'
import { withGeneratorSourceMetadata, withMatchedSourceSideMetadata } from './metadata'

export async function resolveSingleTailwindV4CssSource(
  cssSource: TailwindV4CssSource,
  sourceOptions: TailwindV4SourceOptions,
  options: {
    includesPreflight?: boolean | undefined
    index?: number | undefined
    matched?: boolean
    primary?: boolean | undefined
  } = {},
) {
  const sourceBaseFallback = sourceOptions.base ?? sourceOptions.projectRoot ?? process.cwd()
  const sourceBase = resolveTailwindV4CssSourceBase(cssSource, sourceBaseFallback)
  const normalizedCssSource = normalizeTailwindV4CssSourceConfig(cssSource, sourceBase)
  const source = await resolveTailwindV4Source(createSingleTailwindV4SourceOptions(sourceOptions, {
    base: sourceBase,
    css: normalizedCssSource.css,
  }))
  const resolvedEntries = options.includesPreflight === undefined
    ? await resolveTailwindV4CssSourceEntries(normalizedCssSource, sourceOptions)
    : undefined
  return withGeneratorSourceMetadata(source, {
    cssSourceIndex: options.index,
    includesPreflight: options.includesPreflight ?? resolvedEntries?.includesPreflight,
    matchedCssSourceFile: options.matched && typeof normalizedCssSource.file === 'string'
      ? normalizedCssSource.file
      : undefined,
    primaryCssSource: options.primary === true || (!sourceOptions.cssEntries?.length && options.index === 0) || undefined,
    sourceBase,
    sourceCss: normalizedCssSource.css,
  })
}

export async function resolveTailwindV4CssSourceEntries(
  cssSource: TailwindV4CssSource,
  sourceOptions: TailwindV4SourceOptions,
) {
  if (typeof cssSource.css !== 'string' || cssSource.css.length === 0) {
    return undefined
  }
  const sourceBaseFallback = sourceOptions.base ?? sourceOptions.projectRoot ?? process.cwd()
  const sourceBase = resolveTailwindV4CssSourceBase(cssSource, sourceBaseFallback)
  return resolveTailwindV4EntriesFromCss(cssSource.css, sourceBase)
}

function countRuntimeCandidateHits(candidates: Set<string>, runtime: Set<string> | undefined) {
  if (!runtime?.size) {
    return 0
  }
  let hits = 0
  for (const candidate of candidates) {
    if (runtime.has(candidate)) {
      hits += 1
    }
  }
  return hits
}

export async function resolveCandidateMatchedTailwindV4CssSource(
  _rawSource: string,
  _cssHandlerOptions: IStyleHandlerOptions,
  sourceOptions: TailwindV4SourceOptions,
  selectionOptions: GeneratorSourceSelectionOptions | undefined,
) {
  const cssSources = sourceOptions.cssSources
  const getSourceCandidatesForEntries = selectionOptions?.getSourceCandidatesForEntries
  if (
    !cssSources?.length
    || !getSourceCandidatesForEntries
  ) {
    return undefined
  }

  const matches: Array<{
    cssSource: TailwindV4CssSource
    includesPreflight: boolean
    index: number
    runtimeHits: number
    totalCandidates: number
  }> = []
  await Promise.all(cssSources.map(async (cssSource, index) => {
    const resolved = await resolveTailwindV4CssSourceEntries(cssSource, sourceOptions)
    if (resolved?.entries === undefined) {
      return
    }
    const scopedCandidates = getSourceCandidatesForEntries(resolved?.entries)
    const runtimeHits = countRuntimeCandidateHits(scopedCandidates, selectionOptions?.runtime)
    if (runtimeHits === 0) {
      return
    }
    matches.push({
      cssSource,
      includesPreflight: resolved.includesPreflight,
      index,
      runtimeHits,
      totalCandidates: scopedCandidates.size,
    })
  }))
  if (matches.length === 0) {
    return undefined
  }
  matches.sort((a, b) =>
    b.runtimeHits - a.runtimeHits
    || b.totalCandidates - a.totalCandidates
    || a.index - b.index)
  const best = matches[0]
  const second = matches[1]
  if (!best) {
    return undefined
  }
  if (
    second
    && second.runtimeHits === best.runtimeHits
    && second.totalCandidates === best.totalCandidates
  ) {
    return undefined
  }
  return resolveSingleTailwindV4CssSource(best.cssSource, sourceOptions, {
    includesPreflight: best.includesPreflight,
    index: best.index,
    matched: true,
    primary: isSameTailwindV4CssSource(best.cssSource, selectionOptions?.cssSources?.[0]),
  })
}

async function resolveTailwindV4CssEntryEntries(
  cssEntry: string,
) {
  if (!existsSync(cssEntry)) {
    return undefined
  }
  const file = path.resolve(cssEntry)
  return resolveTailwindV4EntriesFromCss(readFileSync(file, 'utf8'), path.dirname(file))
}

export async function resolveTailwindV4CssEntryIncludesPreflight(cssEntry: string) {
  return resolveTailwindV4CssEntryEntries(cssEntry).then(resolved => resolved?.includesPreflight)
}

export async function resolveCandidateMatchedTailwindV4CssEntry(
  sourceOptions: TailwindV4SourceOptions,
  selectionOptions: GeneratorSourceSelectionOptions | undefined,
) {
  const cssEntries = sourceOptions.cssEntries
  const getSourceCandidatesForEntries = selectionOptions?.getSourceCandidatesForEntries
  if (
    !cssEntries?.length
    || !getSourceCandidatesForEntries
  ) {
    return undefined
  }

  const matches: Array<{
    cssEntry: string
    includesPreflight: boolean
    index: number
    runtimeHits: number
    totalCandidates: number
  }> = []
  await Promise.all(cssEntries.map(async (cssEntry, index) => {
    const resolved = await resolveTailwindV4CssEntryEntries(cssEntry)
    if (resolved?.entries === undefined) {
      return
    }
    const scopedCandidates = getSourceCandidatesForEntries(resolved.entries)
    const runtimeHits = countRuntimeCandidateHits(scopedCandidates, selectionOptions?.runtime)
    if (runtimeHits === 0) {
      return
    }
    matches.push({
      cssEntry,
      includesPreflight: resolved.includesPreflight,
      index,
      runtimeHits,
      totalCandidates: scopedCandidates.size,
    })
  }))
  if (matches.length === 0) {
    return undefined
  }
  matches.sort((a, b) =>
    b.runtimeHits - a.runtimeHits
    || b.totalCandidates - a.totalCandidates
    || a.index - b.index)
  const best = matches[0]
  const second = matches[1]
  if (!best) {
    return undefined
  }
  if (
    second
    && second.runtimeHits === best.runtimeHits
    && second.totalCandidates === best.totalCandidates
  ) {
    return undefined
  }
  return resolveTailwindV4CssEntrySource(best.cssEntry, sourceOptions, {
    candidateMatched: true,
    includesPreflight: best.includesPreflight,
    index: best.index,
  })
}

export function createTailwindV4CssSourceResolver(
  sourceOptions: TailwindV4SourceOptions,
  generatorOptions: NormalizedWeappTailwindcssGeneratorOptions | undefined,
) {
  return (cssSource: NonNullable<typeof sourceOptions.cssSources>[number], index: number) =>
    resolveSingleTailwindV4CssSource(cssSource, sourceOptions, { index })
      .then(source => generatorOptions?.config
        ? {
            ...source,
            css: prependConfigDirective(source.css, generatorOptions.config),
          }
        : source)
}

export async function resolveTailwindV4SourceSideEntrySource(
  resolvedEntrySource: ReturnType<typeof resolveSourceSideCssEntrySource>,
  sourceOptions: ReturnType<typeof resolveTailwindV4SourceOptionsFromRuntime>,
  generatorOptions: NormalizedWeappTailwindcssGeneratorOptions | undefined,
  file: string,
  currentCss?: string,
) {
  if (!resolvedEntrySource) {
    return undefined
  }
  const resolvedSourceOptions = omitUndefined(sourceOptions)
  const config = resolveExistingConfigPath(
    resolvedEntrySource.config,
    resolvedEntrySource.configRequest,
    file,
    {
      ...resolvedSourceOptions,
      sourceFile: resolvedEntrySource.file,
    },
  )
  const css = createTailwindV4SourceReferenceSource(
    normalizeConfigDirective(
      prependConfigDirective(currentCss ?? resolvedEntrySource.css, generatorOptions?.config),
      config,
    ),
    resolvedSourceOptions,
  )
  const source = await resolveTailwindV4Source(createSingleTailwindV4SourceOptions(resolvedSourceOptions, {
    base: currentCss && config ? path.dirname(config) : resolvedEntrySource.base,
    css,
    cssEntries: [resolvedEntrySource.file],
  }))
  const matchedCssEntryIndex = sourceOptions.cssEntries?.findIndex(cssEntry =>
    typeof resolvedEntrySource.file === 'string'
    && path.resolve(cssEntry.replace(/[?#].*$/, '')) === path.resolve(resolvedEntrySource.file),
  )
  const matchedCssSourceIndex = sourceOptions.cssSources?.findIndex(cssSource =>
    typeof cssSource.file === 'string'
    && typeof resolvedEntrySource.file === 'string'
    && path.resolve(cssSource.file.replace(/[?#].*$/, '')) === path.resolve(resolvedEntrySource.file),
  )
  const resolvedEntries = await resolveTailwindV4EntriesFromCss(resolvedEntrySource.css, resolvedEntrySource.base)
  return withMatchedSourceSideMetadata(source, resolvedEntrySource, {
    cssEntryIndex: matchedCssEntryIndex !== undefined && matchedCssEntryIndex >= 0
      ? matchedCssEntryIndex
      : undefined,
    cssSourceIndex: matchedCssSourceIndex !== undefined && matchedCssSourceIndex >= 0
      ? matchedCssSourceIndex
      : undefined,
    includesPreflight: resolvedEntries?.includesPreflight,
    primaryCssSource: matchedCssEntryIndex === 0
      || (!sourceOptions.cssEntries?.length && matchedCssSourceIndex === 0),
  })
}
