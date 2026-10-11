import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'
import type { GeneratorSourceSelectionOptions, TailwindV4CssSource, TailwindV4SourceOptions } from './types'
import type { resolveTailwindV4SourceOptionsFromRuntime } from '@/generator/index'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { isSameTailwindV4CssSource, resolveTailwindV4CssEntrySource } from './configuration'
import { normalizeCssSourceForCompare, scoreTailwindV4CssSourceFileMatch } from './matching'
import { resolvePostcssSourceFile } from './postcss-source'
import { resolveSingleTailwindV4CssSource, resolveTailwindV4CssEntryIncludesPreflight, resolveTailwindV4CssSourceEntries } from './single-source'

export async function resolveMatchingTailwindV4CssEntry(
  rawSource: string,
  file: string,
  sourceOptions: ReturnType<typeof resolveTailwindV4SourceOptionsFromRuntime>,
) {
  const cssEntries = sourceOptions.cssEntries
  if (!cssEntries?.length) {
    return undefined
  }

  const normalizedFile = path.resolve(file.replace(/[?#].*$/, ''))
  const pathMatchedEntries = cssEntries.filter(cssEntry =>
    path.resolve(cssEntry.replace(/[?#].*$/, '')) === normalizedFile,
  )
  if (pathMatchedEntries.length === 1) {
    return resolveTailwindV4CssEntrySource(pathMatchedEntries[0]!, sourceOptions, {
      includesPreflight: await resolveTailwindV4CssEntryIncludesPreflight(pathMatchedEntries[0]!),
      index: cssEntries.indexOf(pathMatchedEntries[0]!),
    })
  }

  const normalizedRawSource = normalizeCssSourceForCompare(rawSource)
  const matches = cssEntries
    .map((cssEntry) => {
      if (!existsSync(cssEntry)) {
        return undefined
      }
      try {
        const entrySource = readFileSync(cssEntry, 'utf8')
        const pathScore = scoreTailwindV4CssSourceFileMatch(file, cssEntry, sourceOptions)
        if (normalizeCssSourceForCompare(entrySource) === normalizedRawSource) {
          return {
            cssEntry,
            score: 1000000 + pathScore,
          }
        }
        return undefined
      }
      catch {
        return undefined
      }
    })
    .filter((match): match is { cssEntry: string, score: number } => Boolean(match))
    .sort((a, b) => b.score - a.score)
  const bestScore = matches[0]?.score
  const matchingEntry = bestScore && matches.filter(match => match.score === bestScore).length === 1
    ? matches[0]?.cssEntry
    : undefined
  if (!matchingEntry) {
    return undefined
  }
  return resolveTailwindV4CssEntrySource(matchingEntry, sourceOptions, {
    includesPreflight: await resolveTailwindV4CssEntryIncludesPreflight(matchingEntry),
    index: cssEntries.indexOf(matchingEntry),
  })
}

export async function resolveMatchingTailwindV4CssSource(
  rawSource: string,
  file: string,
  cssHandlerOptions: IStyleHandlerOptions,
  sourceOptions: TailwindV4SourceOptions,
  selectionOptions?: GeneratorSourceSelectionOptions | undefined,
) {
  const cssSources = sourceOptions.cssSources
  if (!cssSources?.length) {
    return undefined
  }

  const normalizedRawSource = normalizeCssSourceForCompare(rawSource)
  const sourceFile = resolvePostcssSourceFile(cssHandlerOptions)
  const matches = cssSources
    .map((cssSource, index) => {
      if (typeof cssSource.css !== 'string' || cssSource.css.length === 0) {
        return undefined
      }
      if (sourceFile && typeof cssSource.file === 'string' && path.resolve(sourceFile) === path.resolve(cssSource.file)) {
        return {
          cssSource,
          index,
          score: 1000000,
        }
      }
      if (normalizeCssSourceForCompare(cssSource.css) === normalizedRawSource) {
        const pathScore = typeof cssSource.file === 'string'
          ? scoreTailwindV4CssSourceFileMatch(file, cssSource.file, sourceOptions)
          : 0
        return {
          cssSource,
          index,
          score: 1 + pathScore,
        }
      }
      return undefined
    })
    .filter((match): match is { cssSource: TailwindV4CssSource, index: number, score: number } => Boolean(match))
    .sort((a, b) => b.score - a.score || a.index - b.index)
  const bestScore = matches[0]?.score
  const matchingSource = bestScore && matches.filter(match => match.score === bestScore).length === 1
    ? matches[0]?.cssSource
    : undefined
  if (!matchingSource) {
    return undefined
  }
  return resolveSingleTailwindV4CssSource(matchingSource, sourceOptions, {
    includesPreflight: await resolveTailwindV4CssSourceEntries(matchingSource, sourceOptions).then(resolved => resolved?.includesPreflight),
    index: matches[0]?.index,
    matched: true,
    primary: isSameTailwindV4CssSource(matchingSource, selectionOptions?.cssSources?.[0]),
  })
}
