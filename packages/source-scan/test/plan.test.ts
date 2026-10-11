import { describe, expect, it } from 'vitest'
import { createSourceScanPlan } from '../src/plan'

describe('显式扫描策略', () => {
  const positive = { base: '/repo/pages', pattern: '**/*.qxml', negated: false }
  const negative = { base: '/repo', pattern: '**/private/**', negated: true }
  it('兼容回退仅在没有正向来源时添加默认根', () => {
    expect(createSourceScanPlan({ base: '/repo', mode: 'fallback', entries: [positive, negative] })).toEqual([positive, negative])
    expect(createSourceScanPlan({ base: '/repo', mode: 'fallback', entries: [negative] })).toEqual([
      { base: '/repo', pattern: '**/*', negated: false },
      negative,
    ])
  })
  it('禁用自动扫描保留显式来源，默认排除覆盖每个根', () => {
    const plan = createSourceScanPlan({ base: '/repo', mode: 'disabled', entries: [positive], ignoredPatterns: ['**/node_modules/**'] })
    expect(plan).toEqual([
      positive,
      { base: '/repo', pattern: '**/node_modules/**', negated: true },
      { base: '/repo/pages', pattern: '**/node_modules/**', negated: true },
    ])
  })
})
