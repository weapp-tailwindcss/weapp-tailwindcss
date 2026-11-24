/* eslint-disable no-template-curly-in-string -- 按字面量核对可信工作流表达式。 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { parse } from 'yaml'

const workflow = parse(readFileSync(fileURLToPath(new URL('../../../../../.github/workflows/release.yml', import.meta.url)), 'utf8'))

it('nightly 独立路由并保留 OIDC 原身份与签名源码 SHA', () => {
  expect(workflow.on.schedule).toEqual([{ cron: '0 16 * * *' }])
  expect(workflow.jobs['nightly-window'].outputs.run).toBe('${{ steps.window.outputs.run }}')
  for (const jobName of ['nightly-window', 'nightly-publish-window']) {
    const gate = workflow.jobs[jobName].steps[0].run
    expect(gate).toContain('TZ=Asia/Shanghai')
    expect(gate).toContain('if [ "$EVENT_NAME" = "workflow_dispatch" ]')
    expect(gate).toContain('[ "$hour" -lt 4 ]')
  }
  expect(workflow.jobs['nightly-plan'].needs).toBe('nightly-window')
  expect(workflow.jobs.plan.if).toContain('inputs.mode != \'nightly\'')
  expect(workflow.jobs['nightly-plan'].permissions).toEqual({ contents: 'read' })
  expect(workflow.jobs['nightly-native-artifacts'].needs).toBe('nightly-plan')
  expect(workflow.jobs['nightly-native-artifacts'].with.ref).toBe('${{ github.sha }}')
  expect(workflow.jobs['nightly-native-artifacts'].with['nightly-inputs']).toBe(true)
  const nightly = workflow.jobs.nightly
  expect(workflow.jobs['nightly-publish-window'].needs).toEqual(['nightly-window', 'nightly-plan', 'nightly-native-artifacts'])
  expect(workflow.jobs['nightly-publish-window'].outputs.run).toBe('${{ steps.window.outputs.run }}')
  expect(workflow.jobs['nightly-publish-window'].if).toContain("needs.nightly-native-artifacts.result == 'success'")
  expect(workflow.jobs['nightly-publish-window'].steps[0].run).toContain('TZ=Asia/Shanghai')
  expect(nightly.needs).toBe('nightly-publish-window')
  expect(nightly.if).toBe("needs.nightly-publish-window.outputs.run == 'true'")
  expect(nightly.permissions).toEqual({ 'contents': 'read', 'id-token': 'write' })
  expect(nightly.env).toMatchObject({ CI: 'true', REPOCTL_SNAPSHOT_PUBLISH: '1', REPOCTL_NIGHTLY_PROVIDER: 'npm', REPOCTL_NIGHTLY_SCHEDULE: '0 16 * * *' })
  expect(nightly.steps[0].with).toMatchObject({ 'ref': '${{ github.sha }}', 'persist-credentials': false })
  expect(nightly.steps.find((step: any) => step.name === 'Prepare, publish and verify nightly').run).toBe('node scripts/release-nightly/index.mjs')
  expect(nightly.environment).toBeUndefined()
  expect(JSON.stringify(nightly)).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN|CI_RELEASE_SOURCE_SHA|GITHUB_SHA=/)
  expect(workflow.jobs['nightly-consumers']).toMatchObject({ needs: 'nightly', uses: './.github/workflows/nightly-consumers.yml', with: { ref: '${{ github.sha }}' } })
})

it('稳定发布恢复旧提交时不要求新增 nightly collector', () => {
  const native = parse(readFileSync(fileURLToPath(new URL('../../../../../.github/workflows/native.yml', import.meta.url)), 'utf8'))
  expect(native.on.workflow_call.inputs['nightly-inputs']).toMatchObject({ type: 'boolean', default: false })
  const collector = native.jobs.native.steps.find((step: any) => step.name === 'Record verified native source identity')
  expect(collector.if).toBe('inputs.nightly-inputs == true && matrix.image == \'\'')
  expect(workflow.jobs['native-artifacts'].with['nightly-inputs']).toBeUndefined()
})

it('Linux 清单在最后一个 ABI 容器内采集，保留准确工作流身份', () => {
  const native = parse(readFileSync(fileURLToPath(new URL('../../../../../.github/workflows/native.yml', import.meta.url)), 'utf8'))
  const job = native.jobs.native
  const docker = job.steps.filter((step: any) => step.run?.includes('docker run'))
  const collector = docker.at(-1)
  expect(collector.name).toBe('Verify independent PostCSS minimum Node ABI in Linux')
  expect(collector.env).toMatchObject({
    NATIVE_NODE_VERSION: 'v20.19.0',
    NATIVE_NIGHTLY_INPUTS: '${{ inputs.nightly-inputs && \'1\' || \'0\' }}',
  })
  for (const name of ['GITHUB_SHA', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'NATIVE_NIGHTLY_INPUTS']) {
    expect(collector.run).toContain(`-e ${name}`)
  }
  expect(collector.run).toContain('-e NATIVE_CSS_ONLY=1')
  expect(docker.slice(0, -1).every((step: any) => !step.run.includes('NATIVE_NIGHTLY_INPUTS'))).toBe(true)
  const script = readFileSync(fileURLToPath(new URL('../../../../../packages/weapp-tailwindcss/native/ci-linux.sh', import.meta.url)), 'utf8')
  const abi = script.indexOf('node --import tsx packages/weapp-tailwindcss/native/test/package.mjs --css-only')
  expect(abi).toBeGreaterThan(-1)
  expect(script.indexOf('node scripts/release-nightly/native-input.mjs')).toBeGreaterThan(abi)
  expect(script).toContain('set -eu')
  expect(script).toContain('test "${NATIVE_CSS_ONLY:-0}" = 1')
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
  const publication = steps.find((step: any) => step.name === 'Retain nightly publication identity')
  expect(publication.if).toBe('always()')
  expect(publication.uses).toMatch(/^actions\/upload-artifact@/)
  const evidence = steps.find((step: any) => step.name === 'Retain nightly receipts and tarballs')
  expect(evidence.if).toBe('always()')
  expect(evidence.uses).toMatch(/^actions\/upload-artifact@/)
})
