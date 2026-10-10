/* eslint-disable no-template-curly-in-string -- 测试按字面量核验工作流表达式。 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import { resolveChangeScopes } from '../../../../scripts/ci/resolve-pr-scope.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const workflow = (name: string) => parse(readFileSync(join(root, '.github', 'workflows', name), 'utf8'))
const reusableChecks = [
  'pr-gate.yml',
  'release-gate.yml',
  'website-seo-quality.yml',
  'package-readme-quality.yml',
  'architecture.yml',
  'agents.yml',
  'ci.yml',
  'benchmark.yml',
  'react-native-compatibility.yml',
  'lynx-native.yml',
]

describe('版本 PR 的手动完整校验入口', () => {
  it.each(reusableChecks)('%s 可复用调用且保留普通 PR 校验', (name) => {
    const check = workflow(name)
    expect(check.on).toHaveProperty('workflow_call')
    expect(check.on).toHaveProperty('workflow_dispatch')
    expect(check.on).toHaveProperty('pull_request')
    expect(check.permissions).toEqual({ contents: 'read' })
    expect(JSON.stringify(check)).not.toMatch(/id-token|NPM_TOKEN|NODE_AUTH_TOKEN|publish-packages/)
  })

  it.each([
    ['pr-gate.yml', 'pr-gate', 'scope', 'PR Gate'],
    ['website-seo-quality.yml', 'seo-quality', 'detect-website-changes', 'SEO Quality Gate'],
  ])('仅已验证的自动纯版本 PR 在 %s 中等待手动校验', (name, job, scope, stableName) => {
    const check = workflow(name)
    const gate = check.jobs[job]
    const dispatchName = name === 'website-seo-quality.yml'
      ? 'github.event_name == \'workflow_dispatch\' && github.ref_name == \'release/pnpm-version\' && \'Version PR SEO verification\' || '
      : ''
    expect(gate.name).toBe(`\${{ github.event_name == 'pull_request' && needs.${scope}.outputs.metadata_only == 'true' && 'Await manual version verification' || ${dispatchName}'${stableName}' }}`)
    expect(gate.if).toBe('always() && !cancelled()')
    expect(gate.needs).toContain(scope)
    expect(check.jobs[scope].uses).toBe('./.github/workflows/ci-scope.yml')
    expect(check.jobs[scope].with).toBeUndefined()
    // 分支名、标题和作者不能替代共享的实际内容分类。
    expect(gate.name).not.toMatch(/head\.ref|title|actor/)
  })

  it('版本分支单独手动 SEO 保留完整校验，但不能代替全量版本 PR 汇总', () => {
    const { jobs } = workflow('website-seo-quality.yml')
    const seo = jobs['seo-quality']
    expect(seo.name).toContain('github.event_name == \'workflow_dispatch\' && github.ref_name == \'release/pnpm-version\' && \'Version PR SEO verification\'')
    // 分支只决定结果名称，不能据此跳过网站构建和严格校验。
    expect(seo.if).not.toMatch(/ref_name|release\/pnpm-version/)
    expect(seo.steps.every((step: any) => !/ref_name|release\/pnpm-version/.test(step.if ?? ''))).toBe(true)
    expect(jobs['detect-website-changes'].with).toBeUndefined()
    for (const stepName of ['SEO Quality Gate (website)', 'Build website', 'Validate Worker bundle']) {
      expect(seo.steps.find((step: any) => step.name === stepName).if)
        .toBe('needs.detect-website-changes.outputs.website == \'true\'')
    }
  })

  it('手动 CI 继承完整静态、多端和 watch 校验，移动端与 benchmark 保持范围门禁及并发', () => {
    const ci = workflow('ci.yml')
    expect(ci.jobs.scope.if).toBe('github.event_name != \'pull_request\'')
    for (const job of ['quality-static', 'unit-tests', 'e2e-static', 'e2e-focused', 'e2e-multiplatform', 'e2e-watch', 'compatibility']) {
      expect(ci.jobs[job].if).toBe('github.event_name != \'pull_request\' && needs.scope.outputs.core == \'true\'')
    }

    for (const name of ['benchmark.yml', 'react-native-compatibility.yml', 'lynx-native.yml']) {
      const check = workflow(name)
      expect(check.jobs.scope.uses).toBe('./.github/workflows/ci-scope.yml')
      expect(check.jobs.scope.with).toBeUndefined()
      expect(check.concurrency['cancel-in-progress']).toBe(true)
    }
    expect(workflow('benchmark.yml').jobs['benchmark-shard'].strategy['max-parallel']).toBe(2)
    expect(workflow('benchmark.yml').jobs['synthetic-performance'].if).toContain('!inputs.weekly_demo_cost')
    expect(workflow('react-native-compatibility.yml').jobs.android.needs).toEqual(['scope', 'web'])
  })

  it('同一手动验收 run 的子工作流与嵌套工作流使用独立 artifact 名称前缀', () => {
    const artifactOwners = new Map<string, string>()
    for (const name of [...reusableChecks, 'native.yml', 'css-compat.yml', 'demo-matrix.yml']) {
      const { jobs } = workflow(name)
      for (const job of Object.values(jobs) as Array<{ steps?: Array<{ uses?: string, with?: { name?: string } }> }>) {
        for (const step of job.steps ?? []) {
          if (!step.uses?.startsWith('actions/upload-artifact@')) {
            continue
          }
          const prefix = step.with!.name!.split('${{')[0]!
          expect(prefix, name).not.toBe('')
          expect(artifactOwners.get(prefix), `${name} artifact prefix ${prefix}`).toBeUndefined()
          artifactOwners.set(prefix, name)
        }
      }
    }
  })

  it('手动完整校验继承 dispatch 事件，不将缺失 diff 当作纯版本豁免', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    try {
      const scopes = resolveChangeScopes({ eventName: 'workflow_dispatch', cwd: root })
      expect(scopes).toMatchObject({ metadata_only: false, has_changes: true })
      for (const field of ['core', 'watch', 'release', 'website', 'benchmark', 'templates', 'react-native', 'lynx']) {
        expect(scopes[field], field).toBe(true)
      }
    }
    finally {
      stderr.mockRestore()
    }

    const scopeJob = workflow('ci-scope.yml').jobs.scope
    expect(scopeJob.steps[0].with.ref).toBe('${{ github.event.pull_request.head.sha || github.sha }}')
    expect(scopeJob.steps.find((step: any) => step.id === 'scope').env.CI_SCOPE_EVENT_NAME)
      .toBe('${{ github.event_name == \'workflow_dispatch\' && inputs.base && \'pull_request\' || github.event_name }}')
  })

  it('等待名称仍执行轻量分类及严格失败传播，不以 skipped 隐藏错误', () => {
    const pr = workflow('pr-gate.yml').jobs['pr-gate'].steps[0]
    expect(pr.run).toContain('test "$SCOPE_RESULT" = success')
    expect(pr.run).toContain('test "$enabled" = true || test "$enabled" = false')
    expect(pr.run).toContain('test "$CSS_COMPAT_RESULT" = success')
    const seo = workflow('website-seo-quality.yml').jobs['seo-quality'].steps
    expect(seo[0].if).toContain('result != \'success\'')
    expect(seo[0].run).toContain('exit 1')
    expect(seo.find((step: any) => step.name === 'Require website scope output').run)
      .toContain('test "$WEBSITE_ENABLED" = true || test "$WEBSITE_ENABLED" = false')
  })

  it.each([
    ['package-readme-quality.yml', 'validate', 'readme-gate', 'Package README Quality Gate'],
    ['architecture.yml', 'architecture', 'architecture-gate', 'Architecture Quality Gate'],
    ['agents.yml', 'agents', 'agents-gate', 'Agent Workflow Gate'],
  ])('%s 仅延后已证明纯版本的自动 PR 正式校验，并传播范围失败', (name, verification, gateName, stableName) => {
    const check = workflow(name)
    expect(check.jobs.scope.uses).toBe('./.github/workflows/ci-scope.yml')
    expect(check.jobs[verification].needs).toBe('scope')
    expect(check.jobs[verification].if)
      .toBe('github.event_name != \'pull_request\' || needs.scope.outputs.metadata_only != \'true\'')

    const gate = check.jobs[gateName]
    expect(gate.name).toBe(`\${{ github.event_name == 'pull_request' && needs.scope.outputs.metadata_only == 'true' && 'Await manual version verification' || '${stableName}' }}`)
    expect(gate.needs).toEqual(['scope', verification])
    expect(gate.if).toBe('always() && !cancelled()')
    expect(gate.steps[0].env).toEqual({
      SCOPE_RESULT: '${{ needs.scope.result }}',
      METADATA_ONLY: '${{ needs.scope.outputs.metadata_only }}',
      EVENT_NAME: '${{ github.event_name }}',
      VERIFICATION_RESULT: `\${{ needs.${verification}.result }}`,
    })
    expect(gate.steps[0].run).toContain('test "$SCOPE_RESULT" = success')
    expect(gate.steps[0].run).toContain('test "$METADATA_ONLY" = true || test "$METADATA_ONLY" = false')
    expect(gate.steps[0].run).toContain('if test "$EVENT_NAME" != pull_request || test "$METADATA_ONLY" != true; then')
    expect(gate.steps[0].run).toContain('test "$VERIFICATION_RESULT" = success')
  })
})
