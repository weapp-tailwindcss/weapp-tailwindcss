export type BenchmarkMode = 'optimized' | 'legacy' | 'both'

type NumberConstraint = 'positive-integer' | 'nonnegative-integer' | 'positive-number'

export function readBenchmarkArg(flag: string, argv: string[]) {
  const prefix = `${flag}=`
  const inline = argv.find(value => value.startsWith(prefix))
  if (inline !== undefined) {
    return inline.slice(prefix.length)
  }
  const index = argv.indexOf(flag)
  if (index === -1) {
    return undefined
  }
  const value = argv[index + 1]
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`)
  }
  return value
}

export function parseBenchmarkNumber(
  value: string | undefined,
  fallback: number,
  flag: string,
  constraint: NumberConstraint,
) {
  const numeric = value === undefined ? fallback : Number(value)
  const valid = (value === undefined || value.trim().length > 0)
    && Number.isFinite(numeric)
    && (constraint === 'nonnegative-integer' ? numeric >= 0 : numeric > 0)
    && (constraint === 'positive-number' || Number.isInteger(numeric))
  if (!valid) {
    throw new Error(`${flag} must be a ${constraint}; received ${value}`)
  }
  return numeric
}

export function parseBenchmarkMode(value: string | undefined): BenchmarkMode {
  if (value === undefined) {
    return 'both'
  }
  if (value === 'optimized' || value === 'legacy' || value === 'both') {
    return value
  }
  throw new Error(`--mode must be optimized, legacy or both; received ${value}`)
}
