/* eslint-disable no-template-curly-in-string -- 按字面量核对可信工作流表达式。 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { parse } from 'yaml'

const workflow = parse(readFileSync(fileURLToPath(new URL('../../../../../.github/workflows/release.yml', import.meta.url)), 'utf8'))

it('nightly 独立路由并保留 OIDC 原身份与签名源码 SHA', () => {
  expect(workflow.on.schedule).toEqual([{ cron: '0 20 * * *' }])
  expect(workflow.jobs.plan.if).toContain("inputs.mode != 'nightly'")
  expect(workflow.jobs['nightly-plan'].permissions).toEqual({ contents: 'read' })
  expect(workflow.jobs['nightly-native-artifacts'].needs).toBe('nightly-plan')
  expect(workflow.jobs['nightly-native-artifacts'].with.ref).toBe('${{ github.sha }}')
  expect(workflow.jobs['nightly-native-artifacts'].with['nightly-inputs']).toBe(true)
  const nightly = workflow.jobs.nightly
  expect(nightly.needs).toEqual(['nightly-plan', 'nightly-native-artifacts'])
  expect(nightly.permissions).toEqual({ contents: 'read', 'id-token': 'write' })
  expect(nightly.env).toMatchObject({ CI: 'true', REPOCTL_SNAPSHOT_PUBLISH: '1', REPOCTL_NIGHTLY_PROVIDER: 'npm', REPOCTL_NIGHTLY_SCHEDULE: '0 20 * * *' })
  expect(nightly.steps[0].with).toMatchObject({ ref: '${{ github.sha }}', 'persist-credentials': false })
  expect(nightly.steps.find((step: any) => step.name === 'Prepare, publish and verify nightly').run).toBe('node scripts/release-nightly/index.mjs')
  expect(nightly.environment).toBeUndefined()
  expect(JSON.stringify(nightly)).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN|CI_RELEASE_SOURCE_SHA|GITHUB_SHA=/)
  expect(workflow.jobs['nightly-consumers']).toMatchObject({ needs: 'nightly', uses: './.github/workflows/nightly-consumers.yml', with: { ref: '${{ github.sha }}' } })
})

it('稳定发布恢复旧提交时不要求新增 nightly collector', () => {
  const native = parse(readFileSync(fileURLToPath(new URL('../../../../../.github/workflows/native.yml', import.meta.url)), 'utf8'))
  expect(native.on.workflow_call.inputs['nightly-inputs']).toMatchObject({ type: 'boolean', default: false })
  const collector = native.jobs.native.steps.find((step: any) => step.name === 'Record verified native source identity')
  expect(collector.if).toBe('inputs.nightly-inputs == true')
  expect(workflow.jobs['native-artifacts'].with['nightly-inputs']).toBeUndefined()
})

it('发布后覆盖八个真实平台，并保留每个 Node ABI 的消费证据', () => {
  const consumers = parse(readFileSync(fileURLToPath(new URL('../../../../../.github/workflows/nightly-consumers.yml', import.meta.url)), 'utf8'))
  const job = consumers.jobs.consumer
  expect(new Set(job.strategy.matrix.include.map((lane: any) => lane.suffix)).size).toBe(8)
  expect(job.env.NIGHTLY_EXPECTED_SUFFIX).toBe('${{ matrix.suffix }}')
  expect(job.steps.at(-1)).toMatchObject({ if: 'always()', with: { path: '${{ runner.temp }}/nightly-consumer-reports/*.json' } })
  const docker = job.steps.filter((step: any) => step.run?.includes('docker run'))
  expect(docker).toHaveLength(3)
  for (const step of docker) {
    expect(step.run).toContain('-e NIGHTLY_EXPECTED_SUFFIX')
  }
})

it('nightly 在上传前执行完整 native 验证，失败证据始终保存', () => {
  const steps = workflow.jobs.nightly.steps
  const stage = steps.findIndex((step: any) => step.name === 'Stage and verify all native platform packages')
  const publish = steps.findIndex((step: any) => step.name === 'Prepare, publish and verify nightly')
  expect(stage).toBeGreaterThan(-1)
  expect(stage).toBeLessThan(publish)
  expect(steps[stage].run).toBe('pnpm native:artifacts:stage')
  const download = steps.find((step: any) => step.name === 'Download native artifacts from this run')
  expect(download.with['run-id']).toBeUndefined()
  for (const step of steps.slice(publish + 1)) {
    expect(step.if).toBe('always()')
    expect(step.uses).toMatch(/^actions\/upload-artifact@/)
  }
})
