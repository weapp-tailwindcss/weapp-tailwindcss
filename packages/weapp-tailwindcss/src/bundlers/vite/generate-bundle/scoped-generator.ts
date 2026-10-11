import type { SourceCandidateFilterOptions } from '../source-candidates'
import type { TailwindSourceEntry } from '@/tailwindcss/source-scan'
import { analyzeTailwindV4EntrySource } from '@weapp-tailwindcss/postcss/transform'
import { sourcePathApi } from '@weapp-tailwindcss/source-scan'
import { hasCssMacroTailwindV4CustomVariantConditionalComments } from '@/css-macro/auto'
import { resolveTailwindV4EntriesFromCssCached } from '../source-scan'
import { createCandidateSignature } from './signatures'

export function hasOwnSourceDirectives(rawSource: string, scopeToSource = false) {
  const analysis = analyzeTailwindV4EntrySource(rawSource)
  if (!analysis) {
    return false
  }
  const directives = analysis.getSourceDirectives()
  return analysis.configRequests.length > 0 || (scopeToSource && directives.hasSourceNone)
    || Boolean(directives.importSourcePath) || directives.sourceRequests.length > 0
    || directives.inlineCandidates.included.size > 0 || directives.inlineCandidates.excluded.size > 0
}

function createLocalSourceEntries(sourceFile: string): TailwindSourceEntry[] {
  return [{
    base: sourcePathApi(sourceFile).dirname(sourcePathApi(sourceFile).resolve(sourceFile.replace(/[?#].*$/, ''))),
    negated: false,
    pattern: '**/*',
  }]
}

function intersectCandidates(first: Set<string>, second: Set<string>) {
  if (first.size === 0 || second.size === 0) {
    return new Set<string>()
  }
  const [small, large] = first.size <= second.size ? [first, second] : [second, first]
  const scoped = new Set<string>()
  for (const candidate of small) {
    if (large.has(candidate)) {
      scoped.add(candidate)
    }
  }
  return scoped
}

function mergeCandidates(first: Set<string>, second: Set<string>) {
  return new Set([...first, ...second])
}

function canFallbackToOutputCandidates(rawSource: string, entries: TailwindSourceEntry[]) {
  return rawSource.includes('@source')
    && entries.length > 0
    && entries.every(entry => !entry.negated)
}

function resolveScopedSourceEntries(rawSource: string, sourceFile: string, resolvedEntries: TailwindSourceEntry[] | undefined, scopeToSource = false) {
  if (!hasOwnSourceDirectives(rawSource, scopeToSource)) {
    return {
      entries: resolvedEntries,
      localEntries: undefined,
    }
  }
  if (resolvedEntries !== undefined) {
    return {
      entries: resolvedEntries,
    }
  }
  return {
    entries: createLocalSourceEntries(sourceFile),
  }
}

async function resolveScopedGeneratorSourceEntries(rawSource: string, sourceFile: string, scopeToSource = false) {
  const sourceBase = sourcePathApi(sourceFile).dirname(sourcePathApi(sourceFile).resolve(sourceFile.replace(/[?#].*$/, '')))
  const resolved = await resolveTailwindV4EntriesFromCssCached(rawSource, sourceBase)
  return resolveScopedSourceEntries(rawSource, sourceFile, resolved?.entries, scopeToSource)
}

export async function createScopedGeneratorCandidateSignature(
  rawSource: string,
  sourceFile: string,
  fallbackSignature: string,
  getSourceCandidatesForEntries: ((entries: TailwindSourceEntry[] | undefined, options?: SourceCandidateFilterOptions) => Set<string>) | undefined,
  options: { includeFallbackSignature?: boolean | undefined, majorVersion?: number | undefined, scopeToSource?: boolean | undefined } = {},
) {
  if (!getSourceCandidatesForEntries || !hasOwnSourceDirectives(rawSource, options.scopeToSource)) {
    return fallbackSignature
  }
  const { entries } = await resolveScopedGeneratorSourceEntries(rawSource, sourceFile, options.scopeToSource)
  if (entries === undefined) {
    return fallbackSignature
  }
  const scopedCandidates = getSourceCandidatesForEntries(entries)
  const scopedSignature = createCandidateSignature(scopedCandidates)
  return options.includeFallbackSignature === true
    ? `${scopedSignature}:${fallbackSignature}`
    : scopedSignature
}

export async function createScopedGeneratorSourceTraceMap(
  rawSource: string,
  sourceFile: string,
  getSourceCandidateSourcesForEntries: ((entries: TailwindSourceEntry[] | undefined, options?: SourceCandidateFilterOptions) => Map<string, Set<string>>) | undefined,
  options: { scopeToSource?: boolean | undefined } = {},
) {
  if (!getSourceCandidateSourcesForEntries || !hasOwnSourceDirectives(rawSource, options.scopeToSource)) {
    return getSourceCandidateSourcesForEntries?.(undefined)
  }
  const { entries } = await resolveScopedGeneratorSourceEntries(rawSource, sourceFile, options.scopeToSource)
  if (entries === undefined) {
    return getSourceCandidateSourcesForEntries(undefined)
  }
  return getSourceCandidateSourcesForEntries(entries)
}

export async function createScopedGeneratorRuntime(options: {
  cssHandlerOptions: { isMainChunk?: boolean | undefined }
  fallbackRuntime: Set<string>
  getSourceCandidatesForEntries: ((entries: TailwindSourceEntry[] | undefined, options?: SourceCandidateFilterOptions) => Set<string>) | undefined
  majorVersion: number | undefined
  outputFile: string
  rawSource?: string | undefined
  shouldExcludeSubpackageSourceCandidates: (outputFile: string, cssHandlerOptions: { isMainChunk?: boolean | undefined }) => boolean
  sourceFile?: string | undefined
  scopeToSource?: boolean | undefined
  scopedSourceCandidateGetter: ((entries: TailwindSourceEntry[] | undefined, options?: SourceCandidateFilterOptions) => Set<string>) | undefined
}) {
  const {
    cssHandlerOptions,
    fallbackRuntime,
    getSourceCandidatesForEntries,
    outputFile,
    rawSource,
    shouldExcludeSubpackageSourceCandidates,
    sourceFile,
    scopeToSource,
    scopedSourceCandidateGetter,
  } = options
  if (getSourceCandidatesForEntries && rawSource && sourceFile) {
    const { entries } = await resolveScopedGeneratorSourceEntries(rawSource, sourceFile, scopeToSource)
    if (entries !== undefined && (entries.length > 0 || hasOwnSourceDirectives(rawSource, scopeToSource))) {
      const explicitCandidates = getSourceCandidatesForEntries(entries)
      const outputCandidates = scopedSourceCandidateGetter?.(undefined)
      const scopedCandidates = outputCandidates
        ? explicitCandidates.size === 0 && canFallbackToOutputCandidates(rawSource, entries)
          ? outputCandidates
          : intersectCandidates(explicitCandidates, outputCandidates)
        : explicitCandidates
      const shouldMergeFallbackRuntime = hasCssMacroTailwindV4CustomVariantConditionalComments(rawSource)
      return shouldMergeFallbackRuntime ? mergeCandidates(scopedCandidates, fallbackRuntime) : scopedCandidates
    }
  }
  const scopedCandidates = scopedSourceCandidateGetter?.(undefined)
  if (
    scopedCandidates
    && (
      scopedCandidates.size > 0
      || shouldExcludeSubpackageSourceCandidates(outputFile, cssHandlerOptions)
    )
  ) {
    return shouldExcludeSubpackageSourceCandidates(outputFile, cssHandlerOptions)
      ? scopedCandidates
      : mergeCandidates(scopedCandidates, fallbackRuntime)
  }
  if (!shouldExcludeSubpackageSourceCandidates(outputFile, cssHandlerOptions)) {
    return fallbackRuntime
  }
  return fallbackRuntime
}
