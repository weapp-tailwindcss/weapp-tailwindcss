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
    expect(gate.name).toBe(`\${{ github.event_name == 'pull_request' && needs.${scope}.outputs.metadata_only == 'true' && 'Await manual version verification' || '${stableName}' }}`)
    expect(gate.if).toBe('always() && !cancelled()')
    expect(gate.needs).toContain(scope)
    expect(check.jobs[scope].uses).toBe('./.github/workflows/ci-scope.yml')
    expect(check.jobs[scope].with).toBeUndefined()
    // 分支名、标题和作者不能替代共享的实际内容分类。
    expect(gate.name).not.toMatch(/head\.ref|title|actor/)
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
})
