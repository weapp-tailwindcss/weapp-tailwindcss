import type { SourceCandidateCollectorSnapshot } from './types-and-cache'
import { mergeSourcesByPriority } from './source-priority'

type CandidateMap = Map<string, Set<string>>
type SourceMap = Map<string, string>

interface SnapshotMaps {
  candidatesById: CandidateMap
  scanCandidatesById: CandidateMap
  transformCandidatesById: CandidateMap
  cssCandidatesById: CandidateMap
  moduleCandidatesById: CandidateMap
  scanSourceById: SourceMap
  transformSourceById: SourceMap
  cssSourceById: SourceMap
  moduleSourceById: SourceMap
  inlineIncludedCandidates: Set<string>
  inlineExcludedCandidates: Set<string>
}

export function createCandidateSnapshot(maps: SnapshotMaps): SourceCandidateCollectorSnapshot {
  return {
    candidatesById: [...maps.candidatesById.entries()].map(([id, candidates]) => [id, [...candidates]]),
    cssCandidatesById: [...maps.cssCandidatesById.entries()].map(([id, candidates]) => [id, [...candidates]]),
    cssSourceById: [...maps.cssSourceById.entries()],
    moduleCandidatesById: [...maps.moduleCandidatesById.entries()].map(([id, candidates]) => [id, [...candidates]]),
    moduleSourceById: [...maps.moduleSourceById.entries()],
    scanCandidatesById: [...maps.scanCandidatesById.entries()].map(([id, candidates]) => [id, [...candidates]]),
    scanSourceById: [...maps.scanSourceById.entries()],
    sourceById: [...mergeSourcesByPriority(maps.moduleSourceById, maps.transformSourceById, maps.cssSourceById, maps.scanSourceById).entries()],
    transformCandidatesById: [...maps.transformCandidatesById.entries()].map(([id, candidates]) => [id, [...candidates]]),
    transformSourceById: [...maps.transformSourceById.entries()],
    inlineExcludedCandidates: [...maps.inlineExcludedCandidates],
    inlineIncludedCandidates: [...maps.inlineIncludedCandidates],
  }
}

export function restoreCandidateSnapshot(maps: SnapshotMaps, snapshot: SourceCandidateCollectorSnapshot, clear: () => void, recompute: (id: string) => void, setInlineCandidates: (included: Set<string>, excluded: Set<string>) => void) {
  clear()
  setInlineCandidates(new Set(snapshot.inlineIncludedCandidates), new Set(snapshot.inlineExcludedCandidates))
  const restoreCandidates = (target: CandidateMap, entries: Array<[string, string[]]> | undefined) => {
    for (const [id, candidates] of entries ?? []) {
      const candidateSet = new Set(candidates)
      if (candidateSet.size > 0) {
        target.set(id, candidateSet)
      }
    }
  }
  restoreCandidates(maps.scanCandidatesById, snapshot.scanCandidatesById ?? snapshot.candidatesById)
  restoreCandidates(maps.transformCandidatesById, snapshot.transformCandidatesById)
  restoreCandidates(maps.cssCandidatesById, snapshot.cssCandidatesById)
  restoreCandidates(maps.moduleCandidatesById, snapshot.moduleCandidatesById)
  const restoreSources = (target: SourceMap, entries: Array<[string, string]> | undefined) => {
    for (const [id, source] of entries ?? []) {
      target.set(id, source)
    }
  }
  restoreSources(maps.scanSourceById, snapshot.scanSourceById ?? snapshot.sourceById)
  restoreSources(maps.transformSourceById, snapshot.transformSourceById)
  restoreSources(maps.cssSourceById, snapshot.cssSourceById)
  restoreSources(maps.moduleSourceById, snapshot.moduleSourceById)
  const ids = new Set([
    ...maps.scanCandidatesById.keys(),
    ...maps.transformCandidatesById.keys(),
    ...maps.cssCandidatesById.keys(),
    ...maps.moduleCandidatesById.keys(),
  ])
  for (const id of ids) {
    recompute(id)
  }
}
