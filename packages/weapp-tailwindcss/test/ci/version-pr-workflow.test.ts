/* eslint-disable no-template-curly-in-string -- 测试按字面量核验工作流表达式。 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'

const root = path.resolve(import.meta.dirname, '../../../..')
const workflow = YAML.parse(fs.readFileSync(path.join(root, '.github', 'workflows', 'version-pr-ci.yml'), 'utf8'))
const children = ['pr-checks', 'release-checks', 'seo-checks', 'readme-checks', 'architecture-checks', 'agent-checks', 'ci-checks', 'benchmark-checks', 'rn-checks', 'lynx-checks']
const expression = (value: string) => `\${{ ${value} }}`
const identity = "github.event.pull_request.head.ref == 'release/pnpm-version' && github.event.pull_request.head.repo.full_name == github.repository && github.event.pull_request.base.ref == 'main'"

describe('版本 PR 内的审批验收入口', () => {
  it('自动由版本 PR 创建 run，不提供 workflow_dispatch 或发布权限', () => {
    expect(Object.keys(workflow.on)).toEqual(['pull_request'])
    expect(workflow.on.pull_request).toEqual({ branches: ['main'], types: ['opened', 'synchronize', 'reopened', 'ready_for_review'] })
    expect(workflow.permissions).toEqual({ contents: 'read', actions: 'read', 'pull-requests': 'read' })
    expect(workflow.concurrency).toMatchObject({ group: `version-pr-ci-${expression('github.event.pull_request.number')}`, 'cancel-in-progress': true })
    expect(workflow.jobs.validate.if).toBe(identity)
    expect(workflow.jobs.validate.steps[0].with).toMatchObject({ ref: expression('github.event.pull_request.head.sha'), 'fetch-depth': 0, 'persist-credentials': false })
    expect(JSON.stringify(workflow)).not.toMatch(/publish-packages|release-stage|id-token|NPM_TOKEN|NODE_AUTH_TOKEN/)
  })

  it('环境审批 job 不创建 deployment，并在批准后重新核对当前 head', () => {
    const approval = workflow.jobs.approve
    expect(approval.needs).toBe('validate')
    expect(approval.environment).toEqual({ name: 'version-pr-ci', deployment: false })
    expect(approval.steps[0].with.ref).toBe(expression('github.event.pull_request.head.sha'))
    expect(approval.steps.at(-1).run).toBe('node scripts/ci/version-pr-route.mjs --check-current')
  })

  it('所有昂贵检查依赖审批并强制 full_verification', () => {
    for (const name of children) {
      expect(workflow.jobs[name].needs).toBe('approve')
      expect(workflow.jobs[name].with).toEqual({ full_verification: true })
    }
    expect(workflow.jobs['pr-gate'].needs).toEqual(['validate', 'approve', ...children])
    expect(workflow.jobs['pr-gate'].if).toBe(`always() && !cancelled() && ${identity}`)
    expect(workflow.jobs['pr-gate'].steps.at(-1).run).toBe('node scripts/ci/version-pr-route.mjs --check-current')
    expect(workflow.jobs['seo-gate'].needs).toEqual(['validate', 'approve', 'pr-gate'])
    expect(workflow.jobs['seo-gate'].if).toBe(`always() && !cancelled() && ${identity}`)
    expect(workflow.jobs['seo-gate'].steps[0].run).toContain('APPROVAL_RESULT')
  })

  it('汇总命令要求所有子工作流和审批结果成功', () => {
    const command: string = workflow.jobs['pr-gate'].steps[0].run
    const script = command.slice('node -e '.length).slice(1, -1)
    const jobs = ['validate', 'approve', ...children]
    const results = Object.fromEntries(jobs.map(name => [name, { result: 'success' }]))
    const pass = spawnSync(process.execPath, ['-e', script], { env: { ...process.env, NEEDS_JSON: JSON.stringify(results) }, encoding: 'utf8' })
    expect(pass.status, pass.stderr).toBe(0)
    for (const state of ['failure', 'cancelled', 'skipped', '', 'unknown']) {
      const fail = spawnSync(process.execPath, ['-e', script], { env: { ...process.env, NEEDS_JSON: JSON.stringify({ ...results, approve: { result: state } }) }, encoding: 'utf8' })
      expect(fail.status).not.toBe(0)
      expect(fail.stderr).toContain(`approve result=${state}`)
    }
  })

  it('错误状态结构不能被汇总为通过', () => {
    const command: string = workflow.jobs['pr-gate'].steps[0].run
    const script = command.slice('node -e '.length).slice(1, -1)
    const result = spawnSync(process.execPath, ['-e', script], { env: { ...process.env, NEEDS_JSON: '{broken' }, encoding: 'utf8' })
    expect(result.status).not.toBe(0)
  })
})
