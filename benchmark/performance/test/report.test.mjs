import { describe, expect, it } from 'vitest'
import { renderReport } from '../src/report.mjs'

describe('performance report', () => {
  it('renders environment, metrics and known findings', () => {
    const output = renderReport({
      generatedAt: '2026-09-24T00:00:00.000Z',
      commit: 'abc',
      options: { warmups: 2, runs: 7, isolation: 'process' },
      cases: [{ id: 'case', size: 100, time: { median: 1, p95: 2 }, memory: { peakRssMb: 3 }, outputBytes: 4 }],
    }, {
      passed: true,
      violations: [],
      observations: [{ id: 'debt', metric: 'complexityExponent', message: 'known', knownDebt: true }],
      complexity: [{ group: 'postcss-v4', exponent: 2 }],
    })
    expect(output).toContain('abc')
    expect(output).toContain('postcss-v4')
    expect(output).toContain('known')
    expect(output).toContain('color:red')
    expect(output).toContain('独立进程（RSS 不累积前序场景）')
  })
})
