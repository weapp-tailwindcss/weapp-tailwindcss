import assert from 'node:assert/strict'

export const nightlySchedule = '0 20 * * *'

/** Nightly 与稳定恢复分别路由，不能用恢复参数改变 GitHub 签名的源码身份。 */
export function resolveNightlyRoute(env, event) {
  assert.equal(env.GITHUB_REPOSITORY, 'weapp-tailwindcss/weapp-tailwindcss', 'Nightly requires the official repository')
  assert.equal(event.repository?.full_name, env.GITHUB_REPOSITORY)
  assert.equal(event.repository?.default_branch, 'main')
  assert.equal(env.GITHUB_REF, 'refs/heads/main', 'Nightly requires main')
  assert.match(env.GITHUB_SHA ?? '', /^[a-f0-9]{40}$/, 'Nightly requires the exact source SHA')
  assert.ok(['schedule', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME), 'Nightly requires a schedule or manual dispatch')
  if (env.GITHUB_EVENT_NAME === 'schedule') {
    assert.equal(event.schedule, nightlySchedule, 'Nightly schedule differs from configuration')
  }
  else {
    assert.equal(event.inputs?.mode, 'nightly')
    for (const name of ['package', 'version', 'version_pr']) {
      assert.ok(!event.inputs?.[name], `Nightly cannot use recovery input ${name}`)
    }
    assert.ok(![true, 'true'].includes(event.inputs?.oidc_audit), 'Nightly cannot use the audit-only mode')
  }
  return { ref: env.GITHUB_SHA }
}
