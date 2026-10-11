import type { TailwindSourceEntry } from '@/tailwindcss/source-scan'
import { isFileExcludedByTailwindSourceEntries, isFileMatchedByTailwindSourceEntries } from '@/tailwindcss/source-scan'

type CandidateMap = Map<string, Set<string>>

interface CandidateViewOptions {
  candidatesById: CandidateMap
  moduleCandidatesById: CandidateMap
  candidateCount: Map<string, number>
  inlineIncludedCandidates: Set<string>
  inlineExcludedCandidates: Set<string>
}

function isIncludedFile(id: string, isActiveModule: boolean, entries: TailwindSourceEntry[] | undefined, excludeEntries: TailwindSourceEntry[] | undefined) {
  if (entries !== undefined && (isActiveModule
    ? isFileExcludedByTailwindSourceEntries(id, entries)
    : entries.length === 0 || !isFileMatchedByTailwindSourceEntries(id, entries))) {
    return false
  }
  return !(excludeEntries?.length && isFileMatchedByTailwindSourceEntries(id, excludeEntries))
}

export function collectCandidateValues(view: CandidateViewOptions, entries?: TailwindSourceEntry[], excludeEntries?: TailwindSourceEntry[]) {
  if (entries === undefined && !excludeEntries?.length) {
    const values = new Set(view.candidateCount.keys())
    for (const candidate of view.inlineIncludedCandidates) {
      values.add(candidate)
    }
    for (const candidate of view.inlineExcludedCandidates) {
      values.delete(candidate)
    }
    return values
  }
  const filtered = new Set<string>()
  for (const [id, candidates] of view.candidatesById) {
    if (!isIncludedFile(id, view.moduleCandidatesById.has(id), entries, excludeEntries)) {
      continue
    }
    for (const candidate of candidates) {
      filtered.add(candidate)
    }
  }
  for (const candidate of view.inlineIncludedCandidates) {
    filtered.add(candidate)
  }
  for (const candidate of view.inlineExcludedCandidates) {
    filtered.delete(candidate)
  }
  return filtered
}

export function collectCandidateSources(view: CandidateViewOptions, entries?: TailwindSourceEntry[], excludeEntries?: TailwindSourceEntry[]) {
  const sources = new Map<string, Set<string>>()
  const addCandidateSource = (candidate: string, id?: string) => {
    let candidateSources = sources.get(candidate)
    if (!candidateSources) {
      candidateSources = new Set()
      sources.set(candidate, candidateSources)
    }
    if (id) {
      candidateSources.add(id)
    }
  }
  for (const [id, candidates] of view.candidatesById) {
    if (!isIncludedFile(id, view.moduleCandidatesById.has(id), entries, excludeEntries)) {
      continue
    }
    for (const candidate of candidates) {
      addCandidateSource(candidate, id)
    }
  }
  for (const candidate of view.inlineIncludedCandidates) {
    addCandidateSource(candidate)
  }
  for (const candidate of view.inlineExcludedCandidates) {
    sources.delete(candidate)
  }
  return sources
}
