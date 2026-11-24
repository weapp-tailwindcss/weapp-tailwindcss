import { describe, expect, it } from 'vitest'
import { getLegacyWebCompatTargetWarning } from '@/bundlers/vite/shared/web-compat-target-warning'

describe('Vite legacy Web compatibility target warning', () => {
  it('warns when an explicit Chrome or Edge CSS target is below the preset baseline', () => {
    const warning = getLegacyWebCompatTargetWarning({
      target: 'modules',
      cssTarget: ['chrome84', 'edge91'],
    }, true)

    expect(warning).toContain('chrome84')
    expect(warning).toContain('Chrome 91')
    expect(warning).not.toContain('edge91')
  })

  it('uses build.target when Vite CSS target is not specified', () => {
    const warning = getLegacyWebCompatTargetWarning({
      target: 'chrome84',
    }, { preset: 'legacy-web' })

    expect(warning).toContain('chrome84')
  })

  it('ignores targets at or above the baseline and targets outside explicit Chromium versions', () => {
    expect(getLegacyWebCompatTargetWarning({ target: 'chrome91' }, true)).toBeUndefined()
    expect(getLegacyWebCompatTargetWarning({ target: 'esnext' }, true)).toBeUndefined()
    expect(getLegacyWebCompatTargetWarning({ target: 'chrome84', cssTarget: 'chrome120' }, true)).toBeUndefined()
  })

  it('does not warn when legacy Web compatibility is disabled', () => {
    expect(getLegacyWebCompatTargetWarning({ target: 'chrome84' }, false)).toBeUndefined()
    expect(getLegacyWebCompatTargetWarning({ target: 'chrome84' }, { preset: 'off' })).toBeUndefined()
  })
})
