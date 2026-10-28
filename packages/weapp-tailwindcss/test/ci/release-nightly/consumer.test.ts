import { expect, it } from 'vitest'
import { requirePublication } from '../../../../../scripts/release-nightly/consumer.mjs'

const commit = 'a'.repeat(40)
const env = { GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2' }

function publication() {
  const packages = [{ name: 'weapp-tailwindcss', version: '5.0.0-nightly.test', published: true, integrity: 'sha512-test' }]
  return {
    status: 'published',
    confirmed: true,
    consumer: { status: 'verified' },
    repository: 'weapp-tailwindcss/weapp-tailwindcss',
    branch: 'main',
    commit,
    buildId: '123-2',
    packages,
    snapshot: {
      identity: { kind: 'nightly', commit, buildId: '123-2' },
      sourceTree: 'b'.repeat(40),
      preparation: { commit, tree: 'b'.repeat(40), files: [], metadata: { runId: '123', runAttempt: '2' } },
      packages: structuredClone(packages),
      tag: 'snapshot-nightly',
      registry: 'https://registry.npmjs.org/',
    },
  }
}

it('平台消费者仅接收本轮已对账并完成原生消费的发布回执', () => {
  const report = publication()
  expect(requirePublication(report, commit, env)).toBe(report)
})

it.each([
  (report: any) => { report.status = 'prepared' },
  (report: any) => { report.confirmed = false },
  (report: any) => { report.consumer.status = 'failed' },
  (report: any) => { report.repository = 'fork/repo' },
  (report: any) => { report.branch = 'feature' },
  (report: any) => { report.commit = 'c'.repeat(40) },
  (report: any) => { report.buildId = '122-2' },
  (report: any) => { report.snapshot.identity.buildId = '123-1' },
  (report: any) => { report.snapshot.preparation.tree = 'c'.repeat(40) },
  (report: any) => { report.snapshot.preparation.metadata.runAttempt = '1' },
  (report: any) => { report.snapshot.tag = 'latest' },
  (report: any) => { report.packages[0].published = false },
  (report: any) => { report.packages[0].integrity = '' },
  (report: any) => { report.snapshot.packages[0].version = '1.0.0' },
  (report: any) => { report.snapshot.packages.push({ name: 'omitted', version: '1.0.0' }) },
  (report: any) => { report.packages.push(report.packages[0]); report.snapshot.packages.push(report.snapshot.packages[0]) },
])('拒绝未完成、不同源码或不同批次的发布回执 %#', (mutate) => {
  const report = publication()
  mutate(report)
  expect(() => requirePublication(report, commit, env)).toThrow()
})
