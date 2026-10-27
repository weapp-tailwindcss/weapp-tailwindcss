import { expect, it } from 'vitest'
import { nightlySchedule, resolveNightlyRoute } from '../../../../../scripts/release-nightly/route.mjs'

const env = { GITHUB_REPOSITORY: 'weapp-tailwindcss/weapp-tailwindcss', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'a'.repeat(40), GITHUB_EVENT_NAME: 'schedule' }
const event = { repository: { full_name: env.GITHUB_REPOSITORY, default_branch: 'main' }, schedule: nightlySchedule }

it('允许北京时间每日四点及明确的手动 nightly', () => {
  expect(resolveNightlyRoute(env, event)).toEqual({ ref: env.GITHUB_SHA })
  expect(resolveNightlyRoute({ ...env, GITHUB_EVENT_NAME: 'workflow_dispatch' }, { ...event, inputs: { mode: 'nightly' } })).toEqual({ ref: env.GITHUB_SHA })
})

it.each([
  { GITHUB_REPOSITORY: 'fork/repo' },
  { GITHUB_REF: 'refs/heads/feature' },
  { GITHUB_EVENT_NAME: 'pull_request_target' },
  { GITHUB_EVENT_NAME: 'push' },
  { GITHUB_SHA: 'main' },
])('拒绝不可信事件身份 %j', (override) => {
  expect(() => resolveNightlyRoute({ ...env, ...override }, event)).toThrow()
})

it('拒绝 cron 漂移', () => {
  expect(() => resolveNightlyRoute(env, { ...event, schedule: '* * * * *' })).toThrow()
})

it.each(['package', 'version', 'version_pr', 'oidc_audit'])('拒绝 nightly 混用 %s 参数', (field) => {
  expect(() => resolveNightlyRoute({ ...env, GITHUB_EVENT_NAME: 'workflow_dispatch' }, { ...event, inputs: { mode: 'nightly', [field]: 'true' } })).toThrow()
})
