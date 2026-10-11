export function toIsoDate(value: unknown, numericUnit: 'seconds' | 'milliseconds'): string | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') {
    return undefined
  }
  const timestamp = typeof value === 'number' && numericUnit === 'seconds' ? value * 1000 : value
  const parsed = new Date(timestamp)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
}
