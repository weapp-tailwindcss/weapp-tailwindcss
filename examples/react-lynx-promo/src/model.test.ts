import { describe, expect, it } from 'vitest'
import { buildStates, nextBuildState, recentBuilds } from './model'

describe('promo dashboard model', () => {
  it('cycles through deterministic build states', () => {
    expect(nextBuildState(0)).toBe(1)
    expect(nextBuildState(buildStates.length - 1)).toBe(0)
  })

  it('keeps the visible build data stable for recordings', () => {
    expect(buildStates.at(-1)?.progress).toBe('100%')
    expect(recentBuilds).toHaveLength(3)
  })
})
