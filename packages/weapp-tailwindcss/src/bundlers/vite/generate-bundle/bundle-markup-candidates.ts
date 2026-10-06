import type { OutputAsset } from 'rollup'
import type { BundleSnapshot } from '../bundle-state'
import type { SourceCandidateFilterOptions } from '../source-candidates'
import type { createTransformFilter } from './transform-filter'
import type { RuntimeCompilationBuildState } from '@/compiler'
import type { TailwindSourceEntry } from '@/tailwindcss/source-scan'
import path from 'node:path'
import { createCandidateViewMemo } from '@/project-sources/candidates/view-memo'
import { isFileMatchedByTailwindSourceEntries } from '@/tailwindcss/source-scan'
import { shouldSkipViteAssetTransform } from './transform-filter'

interface CollectBundleMarkupCandidatesOptions {
  extractSourceCandidates?: ((file: string, source: string) => Promise<Set<string>>) | undefined
  previousCandidatesByFile?: RuntimeCompilationBuildState['bundleMarkupCandidatesByFile'] | undefined
  preserveMissingFiles?: boolean | undefined
  resolveSourceCandidateFile: (file: string) => string | undefined
  rootDir: string
  snapshot: BundleSnapshot
  transformFilter: ReturnType<typeof createTransformFilter>
}

export interface BundleMarkupCandidateCollection {
  candidatesByFile: RuntimeCompilationBuildState['bundleMarkupCandidatesByFile']
  values: Set<string>
  valuesForEntries: (entries: TailwindSourceEntry[] | undefined, options?: SourceCandidateFilterOptions) => Set<string>
}

export async function collectBundleMarkupCandidates(options: CollectBundleMarkupCandidatesOptions): Promise<BundleMarkupCandidateCollection> {
  const {
    extractSourceCandidates,
    previousCandidatesByFile,
    preserveMissingFiles,
    resolveSourceCandidateFile,
    rootDir,
    snapshot,
    transformFilter,
  } = options
  const candidatesByFile: BundleMarkupCandidateCollection['candidatesByFile'] = preserveMissingFiles
    ? new Map([...(previousCandidatesByFile ?? [])].map(([file, entry]) => [file, { ...entry, candidates: new Set(entry.candidates) }]))
    : new Map()
  for (const file of snapshot.removedFiles) {
    candidatesByFile.delete(file)
  }

  await Promise.all(snapshot.entries.map(async (entry) => {
    if (
      !extractSourceCandidates
      || entry.type !== 'html'
      || entry.output.type !== 'asset'
      || shouldSkipViteAssetTransform(entry.output as OutputAsset, entry.file, rootDir, transformFilter)
    ) {
      return
    }
    const sourceFile = resolveSourceCandidateFile(entry.file)
      ?? path.resolve(rootDir, entry.file)
    candidatesByFile.set(entry.file, { sourceFile, candidates: new Set(await extractSourceCandidates(sourceFile, entry.source)) })
  }))

  // 本轮查询快照与交给下一轮的可变状态分离，避免命中和未命中的查询看到不同候选。
  const queryCandidates = [...candidatesByFile.values()].map(entry => ({ ...entry, candidates: new Set(entry.candidates) }))
  const candidateViewMemo = createCandidateViewMemo()
  const collectValues = (entries: TailwindSourceEntry[] | undefined, filterOptions: SourceCandidateFilterOptions) => {
    const values = new Set<string>()
    for (const { sourceFile: file, candidates } of queryCandidates) {
      if (entries !== undefined && (entries.length === 0 || !isFileMatchedByTailwindSourceEntries(file, entries))) {
        continue
      }
      if (filterOptions.excludeEntries?.length && isFileMatchedByTailwindSourceEntries(file, filterOptions.excludeEntries)) {
        continue
      }
      for (const candidate of candidates) {
        values.add(candidate)
      }
    }
    return values
  }
  const valuesForEntries = (entries: TailwindSourceEntry[] | undefined, filterOptions: SourceCandidateFilterOptions = {}) => {
    if (entries === undefined && !filterOptions.excludeEntries?.length) {
      return collectValues(entries, filterOptions)
    }
    return new Set(candidateViewMemo('values', 0, entries, filterOptions.excludeEntries, () => collectValues(entries, filterOptions)))
  }

  return {
    candidatesByFile,
    values: valuesForEntries(undefined),
    valuesForEntries,
  }
}
