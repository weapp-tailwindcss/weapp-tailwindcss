import { describe, expect, it } from 'vitest'
import { resolveWatchCommandScopes } from './watch/hot-update/command-scopes'

describe('watch command scope planning', () => {
  const full = { splitSubPackageWatchSessions: true, requestedScope: undefined, webOnly: false, mainStyleOnly: false }
  it('preserves all coverage while separating already independent sessions', () => {
    expect(resolveWatchCommandScopes(full)).toEqual(['main-package', 'subpackages'])
  })
  it.each(['main-package', 'subpackages', 'invalid-scope'])('preserves explicit scope %s for CLI validation', (requestedScope) => {
    expect(resolveWatchCommandScopes({ ...full, requestedScope })).toEqual([requestedScope])
  })
  it.each([
    { splitSubPackageWatchSessions: false },
    { webOnly: true },
    { mainStyleOnly: true },
  ])('keeps a single command for other profiles: %j', (profile) => {
    expect(resolveWatchCommandScopes({ ...full, ...profile })).toEqual([undefined])
  })
})
