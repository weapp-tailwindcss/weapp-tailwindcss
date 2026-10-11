import type { TailwindV4SourcePattern } from '../types.ts'
import { isFileExcludedByTailwindSourceEntries, isFileMatchedByTailwindSourceEntries } from '@weapp-tailwindcss/source-scan'

export { expandSourceEntries as expandTailwindV4SourceEntries, groupSourceEntriesByBase as groupTailwindV4SourceEntriesByBase, isFileExcludedByTailwindSourceEntries as isFileExcludedByTailwindV4SourceEntries, mergeSourceEntries as mergeTailwindV4SourceEntries } from '@weapp-tailwindcss/source-scan'

export function isFileMatchedByTailwindV4SourceEntries(file: string, entries: TailwindV4SourcePattern[] | undefined) {
  return isFileMatchedByTailwindSourceEntries(file, entries, { requirePositive: true })
}

export function createTailwindV4SourceEntryMatcher(entries: TailwindV4SourcePattern[] | undefined) {
  return entries?.length ? (file: string) => isFileMatchedByTailwindV4SourceEntries(file, entries) : undefined
}

export function createTailwindV4SourceExclusionMatcher(entries: TailwindV4SourcePattern[] | undefined) {
  return entries?.length ? (file: string) => isFileExcludedByTailwindSourceEntries(file, entries) : undefined
}
