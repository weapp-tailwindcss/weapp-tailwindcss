import type { SourceCandidateCollector, SourceCandidateCollectorOptions } from './types-and-cache'
import { createSourceCandidateStore } from './store'
import { SOURCE_CANDIDATE_CONTENT_CACHE_MAX, sourceCandidateContentCache } from './types-and-cache'

export function createSourceCandidateCollector(options: SourceCandidateCollectorOptions = {}): SourceCandidateCollector {
  return createSourceCandidateStore(options)
}

export function getSourceCandidateContentCacheStatsForTest() {
  return {
    max: SOURCE_CANDIDATE_CONTENT_CACHE_MAX,
    size: sourceCandidateContentCache.size,
    keys: [...sourceCandidateContentCache.keys()],
  }
}

export function clearSourceCandidateContentCacheForTest() {
  sourceCandidateContentCache.clear()
}
