export type CacheInvalidationReason = 'source-change' | 'config-change' | 'runtime-change' | 'platform-change' | 'manual-clear' | 'capacity-eviction'
export interface CacheTelemetry { layer: 'source-scan' | 'candidate-index' | 'tailwind-generation' | 'postcss-result' | 'asset-emission', keyFingerprint: string, hit: boolean, invalidationReason?: CacheInvalidationReason, evicted?: boolean, entries?: number, memoryBytes?: number, revision?: number, operationId?: string }
export interface CacheTelemetryCollector { record: (entry: CacheTelemetry) => void, snapshot: () => readonly CacheTelemetry[], clear: () => void, hitRate: (layer?: CacheTelemetry['layer']) => number, summary: (layer?: CacheTelemetry['layer']) => readonly CacheTelemetrySummary[] }

export interface CacheTelemetrySummary {
  layer: CacheTelemetry['layer']
  samples: number
  hits: number
  misses: number
  invalidations: number
  evictions: number
  entries: number
  memoryBytes: number
}

export function createCacheTelemetryCollector(): CacheTelemetryCollector {
  const entries: CacheTelemetry[] = []
  return {
    record(entry) { entries.push({ ...entry }) },
    snapshot() { return entries },
    clear() { entries.length = 0 },
    hitRate(layer) {
      const selected = layer ? entries.filter(entry => entry.layer === layer) : entries
      return selected.length === 0 ? 0 : selected.filter(entry => entry.hit).length / selected.length
    },
    summary(layer) {
      const selected = layer ? entries.filter(entry => entry.layer === layer) : entries
      const grouped = new Map<CacheTelemetry['layer'], CacheTelemetry[]>()
      for (const entry of selected) {
        const values = grouped.get(entry.layer) ?? []
        values.push(entry)
        grouped.set(entry.layer, values)
      }
      return [...grouped].map(([name, values]) => ({
        layer: name,
        samples: values.length,
        hits: values.filter(entry => entry.hit).length,
        misses: values.filter(entry => !entry.hit).length,
        invalidations: values.filter(entry => entry.invalidationReason !== undefined).length,
        evictions: values.filter(entry => entry.evicted === true).length,
        entries: values.at(-1)?.entries ?? 0,
        memoryBytes: values.at(-1)?.memoryBytes ?? 0,
      }))
    },
  }
}
