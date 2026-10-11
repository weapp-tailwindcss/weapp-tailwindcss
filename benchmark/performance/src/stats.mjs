export function median(values) {
  const sorted = values.filter(Number.isFinite).toSorted((a, b) => a - b)
  if (sorted.length === 0) {
    return 0
  }
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

export function percentile(values, percent) {
  const sorted = values.filter(Number.isFinite).toSorted((a, b) => a - b)
  if (sorted.length === 0) {
    return 0
  }
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * percent / 100) - 1))
  return sorted[index]
}

export function summarize(values) {
  return { count: values.length, median: median(values), p95: percentile(values, 95), p99: percentile(values, 99), min: Math.min(...values), max: Math.max(...values) }
}

export function complexityExponent(points) {
  const usable = points.filter(point => Number.isFinite(point.size) && point.size > 0 && Number.isFinite(point.value) && point.value > 0).map(point => ({ x: Math.log(point.size), y: Math.log(point.value) }))
  if (usable.length < 3) {
    return undefined
  }
  const meanX = usable.reduce((sum, point) => sum + point.x, 0) / usable.length
  const meanY = usable.reduce((sum, point) => sum + point.y, 0) / usable.length
  const numerator = usable.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0)
  const denominator = usable.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0)
  return denominator === 0 ? undefined : numerator / denominator
}
