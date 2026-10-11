import type { SourceMatchPolicy, TailwindSourceEntry } from './types'
import path from 'node:path'
import micromatch from 'micromatch'
import { resolveSourceScanPathWithApi, sourcePathApi, toPosixPath } from './paths'

function normalizeEntryPattern(entry: TailwindSourceEntry) {
  const windows = isWindowsPath(entry.base) || /^[a-z]:[\\/]/i.test(entry.pattern)
  const pathApi = windows ? path.win32 : sourcePathApi(entry.base)
  return pathApi.isAbsolute(entry.pattern)
    ? toPosixPath(pathApi.relative(pathApi.resolve(entry.base), entry.pattern))
    : windows ? toPosixPath(entry.pattern) : entry.pattern
}

function isFileMatchedByTailwindSourceEntry(file: string, entry: TailwindSourceEntry) {
  const pathApi = sourcePathApi(entry.base, file)
  const base = resolveSourceScanPathWithApi(entry.base, pathApi)
  const relative = toPosixPath(pathApi.relative(base, file))
  return relative && !relative.startsWith('../') && !pathApi.isAbsolute(relative) && micromatch.isMatch(relative, normalizeEntryPattern(entry))
}

function isWindowsPath(value: string) {
  return /^[A-Z]:[\\/]/i.test(value) || value.includes('\\')
}

export function isFileExcludedByTailwindSourceEntries(file: string, entries: TailwindSourceEntry[] | undefined) {
  if (!entries?.length) {
    return false
  }
  const resolvedFile = resolveSourceScanMatcherFile(file, entries)
  return entries.some(entry => entry.negated && isFileMatchedByTailwindSourceEntry(resolvedFile, entry))
}

export function isFileMatchedByTailwindSourceEntries(file: string, entries: TailwindSourceEntry[] | undefined, policy: SourceMatchPolicy = {}) {
  if (!entries?.length) {
    return true
  }
  const resolvedFile = resolveSourceScanMatcherFile(file, entries)
  const positiveEntries = entries.filter(entry => !entry.negated)
  const negativeEntries = entries.filter(entry => entry.negated)
  if (positiveEntries.length === 0) {
    return !policy.requirePositive && !negativeEntries.some(entry => isFileMatchedByTailwindSourceEntry(resolvedFile, entry))
  }
  const matchesPositive = positiveEntries.some(entry => isFileMatchedByTailwindSourceEntry(resolvedFile, entry))
  if (!matchesPositive) {
    return false
  }
  return !negativeEntries.some(entry => isFileMatchedByTailwindSourceEntry(resolvedFile, entry))
}

function resolveSourceScanMatcherFile(file: string, entries: TailwindSourceEntry[]) {
  return resolveSourceScanPathWithApi(file, sourcePathApi(file, ...entries.map(entry => entry.base)))
}

export function createTailwindSourceEntryMatcher(entries: TailwindSourceEntry[] | undefined) {
  if (!entries?.length) {
    return undefined
  }
  return (file: string) => isFileMatchedByTailwindSourceEntries(file, entries)
}
