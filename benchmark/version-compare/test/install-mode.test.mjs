import { describe, expect, it } from 'vitest'
import { resolveInstallMode } from '../scripts/install-mode.mjs'

describe('benchmark dependency installation', () => {
  it('keeps the measured checkout frozen and repairs temporary comparison roots', () => {
    expect(resolveInstallMode('current')).toBe('--frozen-lockfile')
    expect(resolveInstallMode('base')).toBe('--no-frozen-lockfile')
    expect(resolveInstallMode('published')).toBe('--no-frozen-lockfile')
  })
})
