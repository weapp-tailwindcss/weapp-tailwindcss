import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'

const root = path.resolve(import.meta.dirname, '../../../..')
const workflow = YAML.parse(fs.readFileSync(path.join(root, '.github', 'workflows', 'version-pr-ci.yml'), 'utf8'))
const jobs = ['validate', 'pr-checks', 'release-checks', 'seo-checks', 'readme-checks', 'architecture-checks', 'agent-checks', 'ci-checks', 'benchmark-checks', 'rn-checks', 'lynx-checks']
const expression = (value: string) => `\${{ ${value} }}`

describe('版本 PR 的单一手动验收入口', () => {
  it('只由人工启动，使用 PR 分支 SHA，不触发发布或准备版本', () => {
    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch'])
    expect(workflow.permissions).toEqual({ 'contents': 'read', 'actions': 'read', 'pull-requests': 'read' })
    expect(workflow.concurrency).toMatchObject({ 'group': `version-pr-ci-${expression('github.ref')}`, 'cancel-in-progress': true })
    const validation = workflow.jobs.validate.steps
    expect(validation[0].with).toMatchObject({ 'ref': expression('github.sha'), 'fetch-depth': 0, 'persist-credentials': false })
    expect(validation.at(-1).run).toContain('version-pr-route.mjs --github-output')
    expect(validation.at(-1).env.GH_TOKEN).toBe(expression('github.token'))
    expect(JSON.stringify(workflow)).not.toMatch(/publish-packages|release-stage|id-token|NPM_TOKEN|NODE_AUTH_TOKEN/)
  })

  it('全部正式检查在确认当前 PR 后执行，不向共享范围传入元数据快路径', () => {
    const children = jobs.slice(1)
    expect(children.map(name => workflow.jobs[name].uses)).toEqual([
      './.github/workflows/pr-gate.yml',
      './.github/workflows/release-gate.yml',
      './.github/workflows/website-seo-quality.yml',
      './.github/workflows/package-readme-quality.yml',
      './.github/workflows/architecture.yml',
      './.github/workflows/agents.yml',
      './.github/workflows/ci.yml',
      './.github/workflows/benchmark.yml',
      './.github/workflows/react-native-compatibility.yml',
      './.github/workflows/lynx-native.yml',
    ])
    for (const name of children) {
      expect(workflow.jobs[name].needs).toBe('validate')
      expect(workflow.jobs[name].with).toBeUndefined()
    }
    expect(workflow.jobs['pr-gate'].name).toBe('PR Gate')
    expect(workflow.jobs['pr-gate'].needs).toEqual(jobs)
    expect(workflow.jobs['pr-gate'].if).toBe('always() && !cancelled()')
    expect(workflow.jobs['seo-gate'].name).toBe('SEO Quality Gate')
    expect(workflow.jobs['seo-gate'].needs).toEqual(['validate', 'pr-gate'])
    expect(workflow.jobs['seo-gate'].steps.at(-1).run).toBe('node scripts/ci/version-pr-route.mjs --check-current')
  })

  const command: string = workflow.jobs['pr-gate'].steps[0].run
  const script = command.slice('node -e '.length).slice(1, -1)
  const results = Object.fromEntries(jobs.map(name => [name, { result: 'success' }]))

  it('执行真实汇总命令，仅所有正式检查成功时通过', () => {
    const result = spawnSync(process.execPath, ['-e', script], { env: { ...process.env, NEEDS_JSON: JSON.stringify(results) }, encoding: 'utf8' })
    expect(result.status, result.stderr).toBe(0)
  })

  it.each(['failure', 'cancelled', 'skipped', '', 'unknown'])('任何应执行检查的 %j 状态都阻断', (state) => {
    for (const name of jobs) {
      const result = spawnSync(process.execPath, ['-e', script], { env: { ...process.env, NEEDS_JSON: JSON.stringify({ ...results, [name]: { result: state } }) }, encoding: 'utf8' })
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain(`${name} result=`)
    }
  })

  it('错误状态结构不能被汇总为通过', () => {
    const result = spawnSync(process.execPath, ['-e', script], { env: { ...process.env, NEEDS_JSON: '{broken' }, encoding: 'utf8' })
    expect(result.status).not.toBe(0)
  })
})
