/* eslint-disable no-template-curly-in-string -- 测试按字面量核验工作流表达式。 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const readWorkflow = (name: string) => parse(readFileSync(join(root, '.github', 'workflows', name), 'utf8'))

describe('Release 分阶段执行与 native 缓存', () => {
  it('从签名的 workflow revision 固定 driver，历史源码切换前完成且验证后不覆盖', () => {
    const { jobs } = readWorkflow('release.yml')
    for (const job of [jobs.plan, jobs.release]) {
      const steps = job.steps
      const pin = steps.findIndex((step: any) => step.name === 'Pin workflow release driver')
      const source = steps.findIndex((step: any) => step.name === 'Checkout validated release source')
      expect(pin).toBeGreaterThan(0)
      expect(steps[pin - 1].with?.ref ?? steps[0].with.ref).toContain('github.sha')
      expect(steps[pin].run).toBe('node scripts/ci/release-stage.mjs --pin')
      expect(pin).toBeLessThan(source)
      expect(steps.slice(source + 1).filter((step: any) => step.uses?.startsWith('actions/checkout@'))).toEqual([])
      expect(steps.slice(source + 1).filter((step: any) => step.run?.includes('--pin'))).toEqual([])
    }
    expect(jobs.release.steps[0].with['persist-credentials']).toBe(false)
    const plan = jobs.plan.steps.find((step: any) => step.id === 'plan')
    expect(plan.run).toContain('test -n "$REPO_RELEASE_VERSION_PR"')
    expect(plan.run).toContain('node "$RELEASE_STAGE_DRIVER" plan')
    // 关联历史版本只调用固定 driver，不能从旧源码载入旧 wrapper。
    expect(jobs.release.steps.filter((step: any) => step.run?.startsWith('node scripts/ci/release-stage.mjs')))
      .toHaveLength(1)
  })

  it('先由 repoctl 判定是否需要发布工作，再启动完整 native 矩阵', () => {
    const { jobs } = readWorkflow('release.yml')
    const route = jobs.plan
    expect(route).toBeDefined()
    expect(route.permissions).toEqual({ contents: 'read', 'pull-requests': 'read' })
    expect(route.outputs.run).toBe('${{ steps.plan.outputs.run }}')
    expect(route.steps.find((step: any) => step.id === 'plan').run).toContain('node scripts/ci/auto-prepare-plan.mjs')
    expect(jobs['native-artifacts'].needs).toBe('plan')
    expect(jobs['native-artifacts'].if).toBe('needs.plan.outputs.run == \'true\'')
    expect(jobs.release.needs).toEqual(['plan', 'native-artifacts'])
    expect(jobs.release.if).toContain('needs.plan.result == \'success\'')
    expect(jobs.release.if).toContain('needs.native-artifacts.result == \'success\'')
    expect(jobs.release.if).toContain('!cancelled()')
  })

  it('上传前在正式 job 内审计同一 OIDC 身份，失败不得继续上传', () => {
    const steps = readWorkflow('release.yml').jobs.release.steps
    const audit = steps.find((step: any) => step.name === 'Audit publishing OIDC identity')
    expect(audit.run).toBe('pnpm exec repo release ci --mode oidc-audit')
    expect(audit.if).toBe('steps.prepare.outputs.publish == \'true\'')
    expect(audit['continue-on-error']).toBeUndefined()
    const index = steps.indexOf(audit)
    expect(steps[index - 1].run).toBe('node "$RELEASE_STAGE_DRIVER" prepare')
    expect(steps[index + 1].run).toBe('node "$RELEASE_STAGE_DRIVER" upload')
  })

  it('在下载本轮 native 产物后重新规划，六个阶段始终在同一 checkout 执行', () => {
    const { jobs } = readWorkflow('release.yml')
    const steps = jobs.release.steps
    const stages = steps.filter((step: any) => step.run?.startsWith('node "$RELEASE_STAGE_DRIVER"'))
    expect(stages.map((step: any) => step.run)).toEqual([
      'node "$RELEASE_STAGE_DRIVER" plan',
      'node "$RELEASE_STAGE_DRIVER" verify',
      'node "$RELEASE_STAGE_DRIVER" prepare',
      'node "$RELEASE_STAGE_DRIVER" upload',
      'node "$RELEASE_STAGE_DRIVER" confirm',
      'node "$RELEASE_STAGE_DRIVER" finalize',
    ])
    expect(steps.findIndex((step: any) => step.name === 'Stage and verify all native platform packages'))
      .toBeLessThan(steps.indexOf(stages[0]))
    for (const stage of stages.slice(3)) {
      expect(stage.if).toBe('steps.prepare.outputs.publish == \'true\'')
    }
    // receipt 属于本 job，不作为 artifact 传给其他 runner 或下一次运行。
    expect(JSON.stringify(jobs)).not.toMatch(/upload-artifact[\s\S]*repoctl-release-ci/)
  })

  it('OIDC 审计独立运行，并避免 setup-node 注入未设置的 token 占位', () => {
    const { jobs, env, permissions } = readWorkflow('release.yml')
    expect(jobs['oidc-audit'].if).toBe('inputs.oidc_audit')
    expect(jobs['oidc-audit'].needs).toBeUndefined()
    expect(jobs['oidc-audit'].env).toBeUndefined()
    expect(env.REPO_RELEASE_PACKAGE).toBeUndefined()
    expect(env.REPO_RELEASE_VERSION).toBeUndefined()
    expect(jobs['oidc-audit'].steps.find((step: any) => step.name === 'Audit npm OIDC').run)
      .toBe('pnpm exec repo release ci --mode oidc-audit')
    expect(permissions).toEqual({ contents: 'read' })
    expect(jobs.release.permissions['id-token']).toBe('write')
    expect(env.NPM_CONFIG_PROVENANCE).toBe(true)
    expect(jobs.release['timeout-minutes']).toBe(45)
    expect(jobs.release.steps.find((step: any) => step.name === 'Checkout validated release source').with.token)
      .toBe(jobs.release.env.GITHUB_TOKEN)
    for (const job of Object.values(jobs) as any[]) {
      for (const step of job.steps ?? []) {
        if (step.uses?.startsWith('actions/setup-node@')) {
          expect(step.with['node-version']).toBe(24)
          expect(step.with['registry-url']).toBeUndefined()
        }
        expect(step.env?.NPM_TOKEN).toBeUndefined()
        expect(step.env?.NODE_AUTH_TOKEN).toBeUndefined()
      }
    }
  })

  it('缓存按 native 目标隔离，Linux 容器使用挂载的 store 并复用同轮依赖', () => {
    const { jobs } = readWorkflow('native.yml')
    const steps = jobs.native.steps
    expect(jobs.native.strategy.matrix.include).toHaveLength(8)
    const node = steps.find((step: any) => step.id === 'node')
    expect(node.with.cache).toBe('${{ matrix.image == \'\' && \'pnpm\' || \'\' }}')
    const caches = steps.filter((step: any) => step.uses?.startsWith('actions/cache@'))
    expect(caches).toHaveLength(3)
    for (const cache of caches) {
      expect(cache.with.key).toContain('matrix.suffix')
    }
    const containers = steps.filter((step: any) => step.run?.includes('docker run'))
    expect(containers).toHaveLength(3)
    for (const step of containers) {
      expect(step.run).toContain('-v "$RUNNER_TEMP/native-ci:/native-ci"')
      expect(step.run).toContain('-e NATIVE_PNPM_STORE=/native-ci/pnpm')
      expect(step.run).toContain('-e GITHUB_RUN_ID -e GITHUB_RUN_ATTEMPT -e GITHUB_JOB')
    }
    expect(containers[0].run).not.toContain('NATIVE_REUSE_DEPENDENCIES')
    for (const step of containers.slice(1)) {
      expect(step.run).toContain('-e NATIVE_REUSE_DEPENDENCIES=1')
    }
    expect(containers[0].run).toContain('-e CARGO_HOME=/native-ci/cargo')
  })
})
