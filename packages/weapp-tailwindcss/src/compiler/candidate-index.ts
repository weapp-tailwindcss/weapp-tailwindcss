import type { CacheTelemetryCollector } from './cache-telemetry'
import type { CandidateChange } from './types'
import { createCompilerValueFingerprint } from '../core/compiler/source-fingerprint'

export class CandidateIndex {
  private readonly candidatesBySource = new Map<string, Set<string>>()

  constructor(private readonly telemetry?: CacheTelemetryCollector) {}

  sync(sourceId: string, candidates: Iterable<string>): CandidateChange {
    const previous = this.candidatesBySource.get(sourceId) ?? new Set<string>()
    const next = new Set(candidates)
    const addedCandidates = new Set([...next].filter(candidate => !previous.has(candidate)))
    const removedCandidates = new Set([...previous].filter(candidate => !next.has(candidate)))
    this.candidatesBySource.set(sourceId, next)
    this.telemetry?.record({
      layer: 'candidate-index',
      keyFingerprint: createCompilerValueFingerprint(sourceId),
      hit: addedCandidates.size === 0 && removedCandidates.size === 0,
      ...(addedCandidates.size || removedCandidates.size ? { invalidationReason: 'source-change' as const } : {}),
      entries: this.candidatesBySource.size,
      memoryBytes: [...this.candidatesBySource.values()].reduce((total, values) => total + values.size * 32, 0),
    })
    return { sourceId, addedCandidates, removedCandidates }
  }

  remove(sourceId: string): CandidateChange {
    const previous = this.candidatesBySource.get(sourceId) ?? new Set<string>()
    this.candidatesBySource.delete(sourceId)
    this.telemetry?.record({ layer: 'candidate-index', keyFingerprint: createCompilerValueFingerprint(sourceId), hit: false, invalidationReason: 'source-change', evicted: true, entries: this.candidatesBySource.size })
    return {
      sourceId,
      addedCandidates: new Set(),
      removedCandidates: new Set(previous),
    }
  }

  values() {
    const values = new Set<string>()
    for (const candidates of this.candidatesBySource.values()) {
      for (const candidate of candidates) {
        values.add(candidate)
      }
    }
    return values
  }

  get(sourceId: string) {
    return new Set(this.candidatesBySource.get(sourceId) ?? [])
  }

  entries() {
    return new Map(
      [...this.candidatesBySource].map(([sourceId, candidates]) => [sourceId, new Set(candidates)]),
    )
  }

  clear() {
    this.candidatesBySource.clear()
  }
}
