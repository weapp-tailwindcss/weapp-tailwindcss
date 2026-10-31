import type { BenchmarkMode } from './options'

export function assertFiniteSamples(values: readonly number[]) {
  if (values.length === 0) {
    throw new Error('Benchmark statistics require at least one sample')
  }
  for (const value of values) {
    if (!Number.isFinite(value)) {
      throw new TypeError('Benchmark statistics require finite samples')
    }
  }
}

function sampleAt(values: readonly number[], index: number): number {
  const value = values[index]
  if (value === undefined || !Number.isFinite(value)) {
    throw new Error(`Missing finite benchmark sample at index ${index}`)
  }
  return value
}

export function formatStats(values: readonly number[]) {
  assertFiniteSamples(values)
  const sorted = [...values].sort((a, b) => a - b)
  const mean = sorted.reduce((acc, value) => acc + value, 0) / sorted.length
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 0
    ? (sampleAt(sorted, mid - 1) + sampleAt(sorted, mid)) / 2
    : sampleAt(sorted, mid)
  const variance = sorted.reduce((acc, value) => acc + ((value - mean) ** 2), 0) / sorted.length
  return { mean, median, stddev: Math.sqrt(variance) }
}

export function percentile(sorted: readonly number[], p: number): number {
  assertFiniteSamples(sorted)
  if (!Number.isFinite(p)) {
    throw new TypeError('Benchmark percentile must be finite')
  }
  const index = Math.ceil((p / 100) * sorted.length) - 1
  return sampleAt(sorted, Math.min(Math.max(index, 0), sorted.length - 1))
}

export function summarizeRunMetrics<Metric extends string>(
  mode: BenchmarkMode,
  optimizedRuns: readonly Record<Metric, number>[],
  legacyRuns: readonly Record<Metric, number>[],
  metrics: readonly Metric[],
) {
  if (mode !== 'both') {
    return []
  }
  return metrics.map((metric) => {
    const optimized = formatStats(optimizedRuns.map(run => run[metric]))
    const legacy = formatStats(legacyRuns.map(run => run[metric]))
    const improvementPercent = legacy.mean === 0
      ? 0
      : ((legacy.mean - optimized.mean) / legacy.mean) * 100
    return { metric, optimized, legacy, improvementPercent }
  })
}
