/* eslint-disable no-template-curly-in-string -- 测试按字面量核验工作流表达式。 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const workflow = (name: string) => parse(readFileSync(join(root, '.github', 'workflows', name), 'utf8'))

describe('手动准备与合并发布的触发边界', () => {
  it('所有 push 均不会自动准备版本，手动默认 prepare', () => {
    const release = workflow('release.yml')
    expect(release.on.push).toBeUndefined()
    expect(release.on.workflow_dispatch.inputs.mode.default).toBe('prepare')
    expect(release.on.pull_request_target).toEqual({ types: ['closed'], branches: ['main'] })
    expect(release.jobs.plan.if).toContain('github.event.pull_request.merged == true')
    expect(release.jobs.plan.if).toContain('github.event.pull_request.head.ref == \'release/pnpm-version\'')
    expect(release.jobs.plan.if).toContain('github.event.pull_request.head.repo.full_name == github.repository')
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
    expect(release.concurrency['cancel-in-progress']).toBe(false)
    expect(release.jobs['oidc-audit'].needs).toBeUndefined()
    expect(release.jobs.release.steps.filter((step: any) => step.run?.startsWith('node scripts/ci/release-stage.mjs')).map((step: any) => step.run)).toHaveLength(6)
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
    expect(seo.jobs['seo-quality'].name).toBe('SEO Quality Gate')
    expect(seo.jobs['seo-quality'].steps[0].if).toContain('result != \'success\'')
    expect(seo.jobs['seo-quality'].steps.find((step: any) => step.name === 'Build website').if).toContain('outputs.website')
  })

  it('源码或分类失败时质量汇总仍执行，轻量版本检查成功后才放行', () => {
    const quality = workflow('ci.yml').jobs.quality
    expect(quality.if).toBe('always() && !cancelled() && github.event_name != \'pull_request\'')
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
