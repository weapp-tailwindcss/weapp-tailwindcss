import type { RememberedCssSource } from './types'
import { normalizeOutputPathKey } from '../../shared/module-graph'
import { hasTailwindGenerationSource } from './sfc-style-source'
import { scoreConfiguredTailwindV4SourceForRawSource } from './tailwind-v4-css-source'

export interface TemporaryCssSourceEntry {
  file: string
  outputFile: string
  source: string
}

export interface CollectTemporaryCssSourceEntriesOptions {
  configuredEntries: TemporaryCssSourceEntry[]
  configuredScopeEntries: TemporaryCssSourceEntry[]
  currentSubpackageRoots: Set<string> | undefined
  explicitSourceFileKeys: ReadonlySet<string>
  isSubpackageOutputFile: (file: string, roots: Set<string>) => boolean
  normalizeConfiguredSourceFile: (file: string) => string
  rememberedEntries: TemporaryCssSourceEntry[]
  resolveRuntimeLinkedSource: (file: string) => TemporaryCssSourceEntry | undefined
  runtimeLinkedCssFiles: Iterable<string>
  shouldSelectConfiguredRootOutput: (outputFile: string) => boolean
}

function shouldQueueTemporarySource(
  entry: TemporaryCssSourceEntry,
  options: CollectTemporaryCssSourceEntriesOptions,
) {
  return normalizeOutputPathKey(entry.outputFile).includes('/')
    || (
      options.explicitSourceFileKeys.has(options.normalizeConfiguredSourceFile(entry.file))
      && options.shouldSelectConfiguredRootOutput(entry.outputFile)
    )
}

export function collectTemporaryCssSourceEntries(
  options: CollectTemporaryCssSourceEntriesOptions,
) {
  const runtimeLinkedEntries = [...options.runtimeLinkedCssFiles]
    .map(file => options.resolveRuntimeLinkedSource(file))
    .filter((entry): entry is TemporaryCssSourceEntry =>
      entry != null
      && options.currentSubpackageRoots != null
      && shouldQueueTemporarySource(entry, options),
    )
  const rememberedEntries = options.rememberedEntries.filter(entry =>
    shouldQueueTemporarySource(entry, options),
  )
  const configuredEntries = options.configuredEntries.filter(entry =>
    normalizeOutputPathKey(entry.outputFile).includes('/')
    || shouldQueueTemporarySource(entry, options),
  )
  const scopedEntries = options.currentSubpackageRoots
    ? options.configuredScopeEntries.filter(entry =>
        options.isSubpackageOutputFile(entry.outputFile, options.currentSubpackageRoots!),
      )
    : []
  return [
    ...runtimeLinkedEntries,
    ...rememberedEntries,
    ...configuredEntries,
    ...scopedEntries,
  ]
}

export function isTemporaryCssAssetFile(file: string) {
  const normalized = normalizeOutputPathKey(file.replace(/[?#].*$/, ''))
  return /\.css$/i.test(normalized) && !normalized.includes('/')
}

function normalizeCssSourceKey(file: string) {
  return normalizeOutputPathKey(file.replace(/[?#].*$/, ''))
}

export function createTemporaryCssAssetSourceResolver(
  entries: TemporaryCssSourceEntry[],
) {
  const seenEntryFiles = new Set<string>()
  const queuedEntries = entries.filter((entry) => {
    const entryFile = normalizeCssSourceKey(entry.file)
    const outputFile = normalizeCssSourceKey(entry.outputFile)
    if (
      outputFile === entryFile
      || seenEntryFiles.has(entryFile)
    ) {
      return false
    }
    seenEntryFiles.add(entryFile)
    return true
  })
  const usedEntryFiles = new Set<string>()

  return {
    entries: queuedEntries,
    markUsed(sourceFile: string | undefined) {
      if (!sourceFile) {
        return
      }
      usedEntryFiles.add(normalizeCssSourceKey(sourceFile))
    },
    resolve(outputFile: string, rawSource?: string): RememberedCssSource | undefined {
      if (!isTemporaryCssAssetFile(outputFile)) {
        return
      }
      const outputFileKey = normalizeCssSourceKey(outputFile)
      const unusedEntries = queuedEntries.filter(item => !usedEntryFiles.has(normalizeCssSourceKey(item.file)))
      const matchedOutputEntries = unusedEntries.filter(item => normalizeCssSourceKey(item.outputFile) === outputFileKey)
      const usesMatchedOutputEntries = matchedOutputEntries.length > 0
      const availableEntries = matchedOutputEntries.length > 0
        ? matchedOutputEntries
        : unusedEntries.filter(item => normalizeCssSourceKey(item.outputFile).includes('/'))
      const scoredEntries = rawSource
        ? availableEntries
            .map(entry => ({
              entry,
              score: scoreConfiguredTailwindV4SourceForRawSource(rawSource, entry.source),
            }))
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score)
        : []
      const bestScore = scoredEntries[0]?.score
      const bestEntries = bestScore
        ? scoredEntries.filter(item => item.score === bestScore)
        : []
      const entry = bestEntries.length === 1
        ? bestEntries[0]?.entry
        : usesMatchedOutputEntries || rawSource == null
          ? availableEntries.find(item => hasTailwindGenerationSource(item.source))
          : undefined
      if (!entry) {
        return
      }
      usedEntryFiles.add(normalizeCssSourceKey(entry.file))
      return {
        outputFile: entry.outputFile,
        rawSource: entry.source,
        sourceFile: entry.file,
      }
    },
  }
}
