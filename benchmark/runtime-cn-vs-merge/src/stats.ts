export interface LatencyStats {
  samples: number
  medianNs: number
  p50Ns: number
  p95Ns: number
  p99Ns: number
  minNs: number
  maxNs: number
  opsPerSecond: number
}

export function percentile(values: number[], pct: number) {
  if (values.length === 0) {
    return 0
  }
  const sorted = [...values].sort((a, b) => a - b)
  if (pct <= 0) {
    return sorted[0]!
  }
  if (pct >= 100) {
    return sorted[sorted.length - 1]!
  }
  const index = Math.ceil((pct / 100) * sorted.length) - 1
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))]!
}

export function median(values: number[]) {
  if (values.length === 0) {
    return 0
  }
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!
}

export function summarizeLatency(samplesNs: number[]): LatencyStats {
  if (samplesNs.length === 0) {
    return {
      samples: 0,
      medianNs: 0,
      p50Ns: 0,
      p95Ns: 0,
      p99Ns: 0,
      minNs: 0,
      maxNs: 0,
      opsPerSecond: 0,
    }
  }
  const medianNs = median(samplesNs)
  return {
    samples: samplesNs.length,
    medianNs,
    p50Ns: percentile(samplesNs, 50),
    p95Ns: percentile(samplesNs, 95),
    p99Ns: percentile(samplesNs, 99),
    minNs: Math.min(...samplesNs),
    maxNs: Math.max(...samplesNs),
    opsPerSecond: medianNs > 0 ? 1e9 / medianNs : 0,
  }
}

export function formatNs(value: number) {
  if (value >= 1e6) {
    return `${(value / 1e6).toFixed(2)} ms`
  }
  if (value >= 1e3) {
    return `${(value / 1e3).toFixed(2)} µs`
  }
  return `${value.toFixed(0)} ns`
}

export function formatOps(value: number) {
  if (value >= 1e6) {
    return `${(value / 1e6).toFixed(2)} M ops/s`
  }
  if (value >= 1e3) {
    return `${(value / 1e3).toFixed(1)} k ops/s`
  }
  return `${value.toFixed(0)} ops/s`
}

export function formatBytes(value: number) {
  const sign = value < 0 ? '-' : ''
  const absolute = Math.abs(value)
  if (absolute < 1024) {
    return `${sign}${absolute} B`
  }
  if (absolute < 1024 * 1024) {
    return `${sign}${(absolute / 1024).toFixed(1)} KiB`
  }
  return `${sign}${(absolute / 1024 / 1024).toFixed(2)} MiB`
}
