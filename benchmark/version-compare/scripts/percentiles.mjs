export function percentile(values, percentileRank) {
  const sorted = values.filter(value => Number.isFinite(value)).sort((a, b) => a - b)
  if (!sorted.length) return undefined
  const rank = Math.min(1, Math.max(0, percentileRank)) * (sorted.length - 1)
  const lower = Math.floor(rank)
  const upper = Math.ceil(rank)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (rank - lower)
}

export function summarizeSamples(values) {
  const samples = values.filter(value => Number.isFinite(value))
  return {
    count: samples.length,
    p50: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
    p99: percentile(samples, 0.99),
  }
}

export function evaluatePercentileGuard(current, baseline, { thresholdPct = 10, minimumSamples = 3 } = {}) {
  if (current?.count < minimumSamples || baseline?.count < minimumSamples) return { status: 'unavailable', passed: false }
  const baselineValue = baseline.p95
  const currentValue = current.p95
  if (!Number.isFinite(baselineValue) || !Number.isFinite(currentValue)) return { status: 'unavailable', passed: false }
  const deltaPct = baselineValue === 0 ? 0 : ((currentValue - baselineValue) / baselineValue) * 100
  return { status: 'complete', passed: deltaPct <= thresholdPct, deltaPct }
}
