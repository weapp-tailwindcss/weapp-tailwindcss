/* eslint-disable no-template-curly-in-string -- 测试按字面量核验工作流表达式。 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const workflow = (name: string) => parse(readFileSync(join(root, '.github', 'workflows', name), 'utf8'))

describe('main 自动准备与合并发布的触发边界', () => {
  it('仅 main push 自动准备版本，手动默认 prepare', () => {
    const release = workflow('release.yml')
    expect(release.on.push).toEqual({ branches: ['main'] })
    expect(release.on.workflow_dispatch.inputs.mode.default).toBe('prepare')
    expect(release.on.workflow_dispatch.inputs.mode.options).toEqual(['auto', 'prepare', 'publish', 'publish-unpublished'])
    expect(release.on.workflow_dispatch.inputs.mode.description).toContain('auto 仅用于预发布分支')
    expect(release.on.pull_request_target).toEqual({ types: ['closed'], branches: ['main'] })
    expect(release.jobs.plan.if).toContain('github.event.pull_request.merged == true')
    expect(release.jobs.plan.if).toContain('github.event.pull_request.head.ref == \'release/pnpm-version\'')
    expect(release.jobs.plan.if).toContain('github.event.pull_request.head.repo.full_name == github.repository')
    expect(release.jobs.plan.if).toContain('github.event_name == \'push\' && github.ref == \'refs/heads/main\'')
    expect(release.jobs.plan.steps[0].with.ref).toBe('${{ github.event.pull_request.merge_commit_sha || github.event.after || github.sha }}')
    expect(release.jobs.plan.steps.find((step: any) => step.id === 'plan').run).toBe('node scripts/ci/auto-prepare-plan.mjs')
  })

  it('路由、native 与发布 checkout 消费相同提交，repoctl 分支和模式来自严格路由', () => {
    const { jobs } = workflow('release.yml')
    expect(jobs['native-artifacts'].with.ref).toBe('${{ needs.plan.outputs.ref }}')
    expect(jobs.release.steps[0].with.ref).toBe('${{ needs.plan.outputs.ref }}')
    expect(jobs.release.env.CI_RELEASE_SOURCE_SHA).toBe('${{ needs.plan.outputs.ref }}')
    expect(jobs.release.env.CI_RELEASE_BRANCH).toBe('${{ needs.plan.outputs.branch }}')
    expect(jobs.release.env.REPO_RELEASE_MODE).toBe('${{ needs.plan.outputs.mode }}')
    expect(jobs.release.if).toContain('needs.plan.result == \'success\'')
    expect(jobs.release.if).toContain('needs.native-artifacts.result == \'success\'')
    expect(workflow('native.yml').jobs.native.steps[0].with.ref).toBe('${{ inputs.ref || github.sha }}')
  })

  it('只读分类和诊断不能取得发布权限，OIDC 与阶段提交仍保留', () => {
    const release = workflow('release.yml')
    expect(release.permissions).toEqual({ contents: 'read' })
    expect(release.jobs.release.permissions['id-token']).toBe('write')
    expect(release.jobs['oidc-audit'].needs).toBeUndefined()
    expect(release.jobs.release.steps.filter((step: any) => step.run?.startsWith('node scripts/ci/release-stage.mjs')).map((step: any) => step.run)).toHaveLength(6)
  })

  it('自动和手动 prepare 共用可取消队列，正式发布和恢复串行且不会被 prepare pending 替换', () => {
    const { concurrency } = workflow('release.yml')
    const prepares = '!inputs.oidc_audit && (github.event_name == \'push\' || (github.event_name == \'workflow_dispatch\' && inputs.mode == \'prepare\'))'
    expect(concurrency.group).toContain(`\${{ github.workflow }}-\${{ ${prepares} && 'prepare' || 'publish' }}-refs/heads/\${{ github.event.pull_request.base.ref || github.ref_name }}\${{ inputs.oidc_audit && '-oidc-audit' || '' }}`)
    expect(concurrency['cancel-in-progress']).toBe(`\${{ ${prepares} }}`)
    expect(concurrency.group).toContain('github.ref_name == \'main\' && inputs.mode == \'auto\'')
    expect(concurrency.group).toContain('github.ref_name != \'main\' && inputs.mode == \'prepare\'')
  })

  it('普通、未合并或外仓 PR 关闭事件不能占用正式 publish 队列', () => {
    const { concurrency } = workflow('release.yml')
    expect(concurrency.group).toContain('github.event_name == \'pull_request_target\' && !(github.event.pull_request.merged == true')
    expect(concurrency.group).toContain('github.event.pull_request.head.ref == \'release/pnpm-version\'')
    expect(concurrency.group).toContain('github.event.pull_request.head.repo.full_name == github.repository')
    expect(concurrency.group).toContain('github.event.pull_request.base.repo.full_name == github.repository')
    expect(concurrency.group).toContain('format(\'-ignored-{0}\', github.run_id)')
  })

  it('完整验证后再次核对自动 source，过期任务不能进入 prepare 改写生成分支', () => {
    const steps = workflow('release.yml').jobs.release.steps
    const fresh = steps.find((step: any) => step.name === 'Require latest main before automatic prepare')
    expect(fresh.if).toBe('github.event_name == \'push\'')
    expect(fresh.run).toBe('node scripts/ci/auto-prepare-plan.mjs --assert-current-main')
    const index = steps.indexOf(fresh)
    expect(steps[index - 1].run).toBe('node scripts/ci/release-stage.mjs verify')
    expect(steps[index + 1].run).toBe('node scripts/ci/release-stage.mjs prepare')
  })

  it('纯版本变更统一经共享内容分类，不创建重型矩阵', () => {
    for (const name of ['pr-gate.yml', 'release-gate.yml', 'ci.yml', 'benchmark.yml', 'react-native-compatibility.yml', 'lynx-native.yml']) {
      expect(workflow(name).jobs.scope.uses, name).toBe('./.github/workflows/ci-scope.yml')
    }
    const gate = workflow('pr-gate.yml')
    expect(gate.jobs['windows-utilities'].needs).toBe('scope')
    expect(gate.jobs['windows-utilities'].if).toContain('needs.scope.outputs.core')
    expect(gate.jobs['pr-gate'].steps[0].run).toContain('test "$SCOPE_RESULT" = success')
    expect(workflow('release-gate.yml').jobs['native-artifacts'].if).toContain('needs.scope.outputs.core')
  })

  it('稳定 SEO 状态检查要求分类成功，纯版本变更不构建网站', () => {
    const seo = workflow('website-seo-quality.yml')
    expect(seo.jobs['detect-website-changes'].uses).toBe('./.github/workflows/ci-scope.yml')
    expect(seo.jobs['seo-quality'].name).toContain('github.event_name == \'pull_request\' && needs.detect-website-changes.outputs.metadata_only == \'true\'')
    expect(seo.jobs['seo-quality'].name).toContain('\'Await manual version verification\'')
    expect(seo.jobs['seo-quality'].name).toMatch(/\|\| 'SEO Quality Gate' \}\}$/)
    expect(seo.jobs['seo-quality'].steps[0].if).toContain('result != \'success\'')
    expect(seo.jobs['seo-quality'].steps.find((step: any) => step.name === 'Build website').if).toContain('outputs.website')
  })

  it('源码或分类失败时质量汇总仍执行，轻量版本检查成功后才放行', () => {
    const quality = workflow('ci.yml').jobs.quality
    expect(quality.if).toBe('always() && !cancelled() && (inputs.full_verification || github.event_name != \'pull_request\')')
    expect(quality.needs).toEqual(['scope', 'quality-static', 'unit-tests'])
    expect(quality.steps[0].env.SCOPE_RESULT).toBe('${{ needs.scope.result }}')
    expect(quality.steps[0].env.CORE_ENABLED).toBe('${{ needs.scope.outputs.core }}')
    expect(quality.steps[0].run).toContain('test "$SCOPE_RESULT" = success')
    expect(quality.steps[0].run).toContain('if test "$CORE_ENABLED" = true; then')
    expect(quality.steps[0].run).toContain('test "$STATIC_RESULT" = success')
    expect(quality.steps[0].run).toContain('test "$UNIT_RESULT" = success')
  })

  it('汇总不把缺失或非法范围输出当作关闭检查', () => {
    for (const [name, job] of [['ci.yml', 'quality'], ['release-gate.yml', 'release-gate']] as const) {
      expect(workflow(name).jobs[job].steps[0].run).toContain('test "$CORE_ENABLED" = true || test "$CORE_ENABLED" = false')
    }
    expect(workflow('pr-gate.yml').jobs['pr-gate'].steps[0].run).toContain('test "$enabled" = true || test "$enabled" = false')
    const seo = workflow('website-seo-quality.yml').jobs['seo-quality']
    const outputCheck = seo.steps.find((step: any) => step.name === 'Require website scope output')
    expect(outputCheck?.env.WEBSITE_ENABLED).toBe('${{ needs.detect-website-changes.outputs.website }}')
    expect(outputCheck?.run).toContain('test "$WEBSITE_ENABLED" = true || test "$WEBSITE_ENABLED" = false')
  })

  it('限制矩阵并发，移动端与 SEO 的旧 head 可取消', () => {
    expect(workflow('native.yml').jobs.native.strategy['max-parallel']).toBe(4)
    expect(workflow('benchmark.yml').jobs['benchmark-shard'].strategy['max-parallel']).toBe(2)
    for (const name of ['react-native-compatibility.yml', 'lynx-native.yml', 'website-seo-quality.yml']) {
      expect(workflow(name).concurrency['cancel-in-progress']).toBe(true)
    }
    // web 与 iOS 并行，Android 在 web 后启动，最多同时执行两个 Expo job。
    expect(workflow('react-native-compatibility.yml').jobs.android.needs).toEqual(['scope', 'web'])
  })
})
