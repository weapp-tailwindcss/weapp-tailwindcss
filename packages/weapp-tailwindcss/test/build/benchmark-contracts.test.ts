import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseBenchmarkMode, parseBenchmarkNumber } from '../../../../tools/weapp-tailwindcss-scripts/src/benchmark/options'
import { assertFiniteSamples, formatStats, percentile, summarizeRunMetrics } from '../../../../tools/weapp-tailwindcss-scripts/src/benchmark/statistics'

describe('private benchmark input contracts', () => {
  it('preserves defaults, zero warmup and finite timeout precision', () => {
    expect(parseBenchmarkNumber(undefined, 5, '--runs', 'positive-integer')).toBe(5)
    expect(parseBenchmarkNumber(undefined, 1, '--warmup', 'nonnegative-integer')).toBe(1)
    expect(parseBenchmarkNumber(undefined, 120000, '--timeout', 'positive-number')).toBe(120000)
    expect(parseBenchmarkNumber('0', 1, '--warmup', 'nonnegative-integer')).toBe(0)
    expect(parseBenchmarkNumber('15.5', 120000, '--timeout', 'positive-number')).toBe(15.5)
    expect(parseBenchmarkMode(undefined)).toBe('both')
  })

  it.each(['0', '-1', '1.5', 'NaN', 'Infinity', '', ' '])('rejects invalid measured run count %j', (value) => {
    expect(() => parseBenchmarkNumber(value, 5, '--runs', 'positive-integer')).toThrow('--runs')
  })

  it.each(['-1', '0.5', 'NaN', 'Infinity', ''])('rejects invalid warmup count %j', (value) => {
    expect(() => parseBenchmarkNumber(value, 1, '--warmup', 'nonnegative-integer')).toThrow('--warmup')
  })

  it.each(['0', '-1', 'NaN', 'Infinity', ''])('rejects invalid timeout %j', (value) => {
    expect(() => parseBenchmarkNumber(value, 120000, '--timeout', 'positive-number')).toThrow('--timeout')
  })

  it('accepts the three comparison modes and rejects unknown modes', () => {
    for (const mode of ['optimized', 'legacy', 'both']) {
      expect(parseBenchmarkMode(mode)).toBe(mode)
    }
    expect(() => parseBenchmarkMode('legcay')).toThrow('--mode')
  })

  it.each([
    ['vite-perf-bench.ts', '--runs'],
    ['vite-dev-hmr-bench.ts', '--runs'],
    ['js-bench.ts', '--iter'],
    ['js-bench-diff.ts', '--iter'],
  ])('rejects invalid CLI counts before %s can write a report or load source', (script, flag) => {
    const root = fileURLToPath(new URL('../../../../', import.meta.url))
    const scratch = mkdtempSync(join(tmpdir(), 'weapp-bench-invalid-'))
    const report = join(scratch, 'report.json')
    try {
      const result = spawnSync(process.execPath, [
        '--import',
        'tsx',
        join(root, 'tools/weapp-tailwindcss-scripts/src', script),
        `${flag}=0`,
        '--warmup=0',
        '--glob=__benchmark_invalid_input_no_source__',
        `--cwd=${scratch}`,
        `--output=${report}`,
        `--save=${report}`,
      ], { cwd: root, encoding: 'utf8', timeout: 5000 })
      expect(result.error).toBeUndefined()
      expect(result.signal).toBeNull()
      expect(result.status).toBe(1)
      expect(result.stderr).toContain(`${flag} must be a positive-integer`)
      expect(existsSync(report)).toBe(false)
    }
    finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  }, 10000)

  it.each([
    ['vite-perf-bench.ts', '--runs'],
    ['vite-perf-bench.ts', '--warmup'],
    ['vite-perf-bench.ts', '--timeout'],
    ['vite-perf-bench.ts', '--mode'],
    ['vite-dev-hmr-bench.ts', '--runs'],
    ['vite-dev-hmr-bench.ts', '--warmup'],
    ['vite-dev-hmr-bench.ts', '--timeout'],
    ['vite-dev-hmr-bench.ts', '--mode'],
  ])('rejects a missing %s option value for %s before launching work', (script, flag) => {
    const root = fileURLToPath(new URL('../../../../', import.meta.url))
    const scratch = mkdtempSync(join(tmpdir(), 'weapp-bench-missing-'))
    const report = join(scratch, 'report.json')
    try {
      const result = spawnSync(process.execPath, [
        '--import',
        'tsx',
        join(root, 'tools/weapp-tailwindcss-scripts/src', script),
        `--cwd=${join(scratch, 'absent')}`,
        `--output=${report}`,
        flag,
      ], { cwd: root, encoding: 'utf8', timeout: 5000 })
      expect(result.error).toBeUndefined()
      expect(result.signal).toBeNull()
      expect(result.status).toBe(1)
      expect(result.stderr).toContain(`${flag} requires a value`)
      expect(existsSync(report)).toBe(false)
    }
    finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  }, 10000)
})

describe('private benchmark statistical contracts', () => {
  it('preserves the averaged Vite median and population variance without mutating samples', () => {
    const values = [7, 1, 3, 5]
    expect(formatStats(values)).toEqual({ mean: 4, median: 4, stddev: Math.sqrt(5) })
    expect(formatStats([9, 2, 4])).toEqual({ mean: 5, median: 4, stddev: Math.sqrt(26 / 3) })
    expect(values).toEqual([7, 1, 3, 5])
    expect(formatStats([0])).toEqual({ mean: 0, median: 0, stddev: 0 })
  })

  it('preserves JS nearest-rank median, p95 and clamped percentile boundaries', () => {
    const values = [1, 3, 5, 7]
    expect(percentile(values, 50)).toBe(3)
    expect(percentile(values, 95)).toBe(7)
    expect(percentile(values, -1)).toBe(1)
    expect(percentile(values, 101)).toBe(7)
  })

  it.each([
    { values: [] },
    { values: [Number.NaN] },
    { values: [Number.POSITIVE_INFINITY] },
    { values: [1, Number.NEGATIVE_INFINITY] },
  ])('rejects invalid samples $values instead of reporting zero or null', ({ values }) => {
    expect(() => assertFiniteSamples(values)).toThrow('Benchmark statistics require')
    expect(() => formatStats(values)).toThrow('Benchmark statistics require')
    expect(() => percentile(values, 50)).toThrow('Benchmark statistics require')
  })

  it('rejects a nonfinite percentile', () => {
    expect(() => percentile([1], Number.NaN)).toThrow('percentile')
  })

  it('keeps single modes free of a fabricated comparison and rejects missing sides in both mode', () => {
    const runs = [{ startupMs: 10 }]
    expect(summarizeRunMetrics('legacy', [], runs, ['startupMs'])).toEqual([])
    expect(summarizeRunMetrics('optimized', runs, [], ['startupMs'])).toEqual([])
    expect(() => summarizeRunMetrics('both', [], runs, ['startupMs'])).toThrow('at least one')
    expect(() => summarizeRunMetrics('both', runs, [], ['startupMs'])).toThrow('at least one')
  })

  it('compares measured runs with the original arithmetic and zero-baseline policy', () => {
    expect(summarizeRunMetrics('both', [{ ms: 2 }, { ms: 6 }], [{ ms: 6 }, { ms: 10 }], ['ms'])).toEqual([{
      metric: 'ms',
      optimized: { mean: 4, median: 4, stddev: 2 },
      legacy: { mean: 8, median: 8, stddev: 2 },
      improvementPercent: 50,
    }])
    expect(summarizeRunMetrics('both', [{ ms: 0 }], [{ ms: 0 }], ['ms'])[0]?.improvementPercent).toBe(0)
  })
})
