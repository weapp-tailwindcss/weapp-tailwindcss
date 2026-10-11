import { describe, expect, it } from 'vitest'
import config from '../scenarios.json' with { type: 'json' }
import { createScenarios } from '../src/scenarios.mjs'

describe('performance scenarios', () => {
  it('keeps the cross-layer scenario families and at least three scales', () => {
    const cases = createScenarios({ ...config, includeStress: false })
    const ids = new Set(cases.map(item => item.id))

    expect(ids.has('postcss-v4-structured-1000')).toBe(true)
    expect(ids.has('postcss-v4-cache-hit-5000')).toBe(true)
    expect(ids.has('core-source-scan-200')).toBe(true)
    expect(ids.has('core-explicit-candidates-100')).toBe(true)
    expect(ids.has('core-incremental-append-50')).toBe(true)
    expect(ids.has('hmr-class-churn-100')).toBe(true)
    expect(ids.has('bundler-esbuild-200')).toBe(true)
    expect(cases.filter(item => item.complexityGroup === 'postcss-v4')).toHaveLength(9)
    expect(cases.filter(item => item.complexityGroup === 'postcss-v4-cache-hit')).toHaveLength(3)
  })
})
