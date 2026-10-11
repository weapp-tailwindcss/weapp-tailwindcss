import { describe, expect, it } from 'vitest'
import { complexityExponent, median, percentile } from '../src/stats.mjs'

describe('performance statistics', () => {
  it('calculates stable median and percentile values', () => {
    expect(median([3, 1, 2, 4])).toBe(2.5)
    expect(percentile([1, 2, 3, 4], 95)).toBe(4)
  })

  it('detects quadratic scaling from three size points', () => {
    expect(complexityExponent([
      { size: 100, value: 10 },
      { size: 200, value: 40 },
      { size: 400, value: 160 },
    ])).toBeCloseTo(2, 5)
  })
})
