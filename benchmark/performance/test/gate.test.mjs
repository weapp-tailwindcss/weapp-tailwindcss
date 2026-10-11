import { describe, expect, it } from 'vitest'
import { evaluateSyntheticGate } from '../src/gate.mjs'

const config = {
  budgets: {
    default: { medianMs: 10, p95Ms: 20, peakRssMb: 100, outputBytes: 1000 },
    cases: {
      'postcss-v4-main-1000': { medianMs: 100, p95Ms: 100, peakRssMb: 100, outputBytes: 1000 },
      'postcss-v4-main-2000': { medianMs: 100, p95Ms: 100, peakRssMb: 100, outputBytes: 1000 },
      'postcss-v4-main-5000': { medianMs: 100, p95Ms: 100, peakRssMb: 100, outputBytes: 1000 },
    },
  },
  debts: {
    debts: [{ id: 'postcss-v4-root-content-scan', issue: 'https://github.com/sonofmagic/weapp-tailwindcss/issues/1238', maxComplexityExponent: 1.25, blocking: false }],
  },
}

function report(cases) {
  return { options: { runs: 3 }, cases }
}

function result(id, size, medianMs, hashes = ['stable']) {
  return { id, group: 'postcss', size, sampleCount: 3, time: { median: medianMs, p95: medianMs }, memory: { peakRssMb: 10 }, outputBytes: 10, outputHashes: hashes }
}

describe('synthetic performance gate', () => {
  it('keeps the known #1238 complexity issue observable without blocking', () => {
    const gate = evaluateSyntheticGate(report([
      result('postcss-v4-main-1000', 1000, 1),
      result('postcss-v4-main-2000', 2000, 4),
      result('postcss-v4-main-5000', 5000, 25),
    ]), config)
    expect(gate.passed).toBe(true)
    expect(gate.observations).toEqual([expect.objectContaining({ id: 'postcss-v4-root-content-scan', knownDebt: true })])
  })

  it('blocks a budget regression and unstable output', () => {
    const gate = evaluateSyntheticGate(report([result('other-1', 1, 11, ['a', 'b'])]), config)
    expect(gate.passed).toBe(false)
    expect(gate.violations.map(item => item.metric)).toEqual(expect.arrayContaining(['medianMs', 'outputHash']))
  })

  it('blocks a known debt when its complexity worsens beyond the recorded baseline', () => {
    const gate = evaluateSyntheticGate(report([
      result('postcss-v4-main-1000', 1000, 1),
      result('postcss-v4-main-2000', 2000, 8),
      result('postcss-v4-main-5000', 5000, 80),
    ]), {
      ...config,
      debts: {
        debts: [{
          ...config.debts.debts[0],
          baselineComplexityExponent: 2,
          worseningTolerancePercent: 5,
        }],
      },
    })
    expect(gate.passed).toBe(false)
    expect(gate.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ metric: 'knownDebtWorsening' }),
    ]))
  })
})
