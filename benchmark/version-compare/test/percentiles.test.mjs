import { describe, expect, it } from 'vitest'
import { evaluatePercentileGuard, summarizeSamples } from '../scripts/percentiles.mjs'

describe('阶段性能统计', () => {
  it('计算 p50/p95/p99 与样本数', () => {
    const result = summarizeSamples([1, 2, 3, 4, 5])
    expect(result).toMatchObject({ count: 5, p50: 3, p95: 4.8, p99: 4.96 })
  })

  it('样本不足时标记 unavailable', () => {
    expect(evaluatePercentileGuard(summarizeSamples([1]), summarizeSamples([1]))).toMatchObject({ status: 'unavailable', passed: false })
  })

  it('超过阈值时失败', () => {
    const baseline = summarizeSamples([10, 10, 10])
    const current = summarizeSamples([12, 12, 12])
    expect(evaluatePercentileGuard(current, baseline, { thresholdPct: 10 })).toMatchObject({ status: 'complete', passed: false })
  })
})
