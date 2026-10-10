/* eslint-disable no-template-curly-in-string -- 测试按字面量核验工作流表达式。 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const root = resolve(import.meta.dirname, '../../../..')
const workflow = (name: string) => parse(readFileSync(join(root, '.github', 'workflows', name), 'utf8'))
const children = ['pr-gate.yml', 'release-gate.yml', 'website-seo-quality.yml', 'package-readme-quality.yml', 'architecture.yml', 'agents.yml', 'ci.yml', 'benchmark.yml', 'react-native-compatibility.yml', 'lynx-native.yml', 'css-compat.yml']

describe('审批后的版本 PR 完整验收链路', () => {
  it.each([...children, 'ci-scope.yml'])('%s 默认保持自动路径，完整执行必须由调用方显式传入', (name) => {
    const check = workflow(name)
    expect(check.on.workflow_call.inputs.full_verification).toMatchObject({ type: 'boolean', default: false, required: false })
    expect(check.on.workflow_dispatch?.inputs?.full_verification).toBeUndefined()
    expect(check.permissions).toEqual({ contents: 'read' })
  })

  it.each(children)('%s 将完整执行范围传给每个共享 scope，不丢失嵌套调用', (name) => {
    const check = workflow(name)
    for (const job of Object.values(check.jobs) as any[]) {
      if (job.uses === './.github/workflows/ci-scope.yml') {
        expect(job.with.full_verification).toBe('${{ inputs.full_verification || false }}')
      }
      if (job.uses === './.github/workflows/css-compat.yml') {
        expect(job.with.full_verification).toBe('${{ inputs.full_verification || false }}')
      }
    }
  })

  it('共享范围仍分类实际 diff，使用独立参数切换执行范围', () => {
    const scope = workflow('ci-scope.yml').jobs.scope.steps.find((step: any) => step.id === 'scope')
    expect(scope.env.CI_SCOPE_FULL_VERIFICATION).toBe('${{ inputs.full_verification || false }}')
    expect(scope.run).toContain('--full-verification "$CI_SCOPE_FULL_VERIFICATION"')
    expect(scope.env.CI_SCOPE_EVENT_NAME).toContain('github.event_name')
  })

  it.each(children)('%s 完整验收的所有 checkout 精确绑定 PR head，默认仍使用原事件提交', (name) => {
    for (const job of Object.values(workflow(name).jobs) as any[]) {
      for (const step of job.steps ?? []) {
        if (step.uses?.startsWith('actions/checkout@')) {
          expect(step.with?.ref).toBe('${{ inputs.full_verification && github.event.pull_request.head.sha || github.sha }}')
        }
      }
    }
  })

  it('native 只接收经父级范围允许的准确构建 ref', () => {
    const native = workflow('release-gate.yml').jobs['native-artifacts']
    expect(native.if).toBe('needs.scope.outputs.core == \'true\'')
    expect(native.with.ref).toBe('${{ inputs.full_verification && github.event.pull_request.head.sha || github.sha }}')
  })

  it.each(children)('%s 复用完整验收与独立自动工作流不共享取消组', (name) => {
    const concurrency = workflow(name).concurrency
    if (concurrency) {
      expect(concurrency.group).toContain('inputs.full_verification && format(\'full-{0}\', github.run_id)')
      expect(concurrency['cancel-in-progress']).toBe(true)
    }
  })

  it('同一审批 run 的不同子工作流具有独立取消组，避免嵌套验收互相取消', () => {
    const groups = children.map(name => workflow(name).concurrency?.group).filter(Boolean)
    expect(new Set(groups).size).toBe(groups.length)
  })

  it('CI 的完整路径包含原来排除 PR 的质量、多端、watch 和五项兼容矩阵', () => {
    const { jobs } = workflow('ci.yml')
    for (const name of ['scope', 'quality-static', 'unit-tests', 'quality', 'e2e-static', 'e2e-focused', 'e2e-multiplatform', 'e2e-watch', 'compatibility']) {
      expect(jobs[name].if).toContain('inputs.full_verification')
    }
    expect(jobs.compatibility.strategy.matrix.include).toContain('inputs.full_verification || github.event_name == \'workflow_dispatch\'')
    expect(jobs.compatibility.strategy.matrix.include).toContain('macos-node22-core')
    expect(jobs.compatibility.strategy.matrix.include).toContain('node22-min-core')
  })

  it.each(['scope', 'quality-static', 'unit-tests', 'e2e-static', 'e2e-focused', 'e2e-multiplatform', 'e2e-watch', 'compatibility'])('CI %s 的普通 PR 不自动运行，审批后实际条件允许执行', (name) => {
    const condition = workflow('ci.yml').jobs[name].if
    const context = {
      inputs: { full_verification: false },
      github: { event_name: 'pull_request' },
      needs: { scope: { outputs: { core: 'true' } } },
    }
    expect(runInNewContext(condition, context)).toBe(false)
    expect(runInNewContext(condition, { ...context, inputs: { full_verification: true } })).toBe(true)
    expect(runInNewContext(condition, { ...context, github: { event_name: 'push' } })).toBe(true)
  })

  it('普通 PR 与审批后的完整调用实际选择不同 checkout，不能读取更新中的分支名', () => {
    const checkout = workflow('pr-gate.yml').jobs.quality.steps[0].with.ref
    const expression = checkout.slice(3, -2).trim()
    const github = { sha: 'merge-commit', event: { pull_request: { head: { sha: 'event-head' } } } }
    expect(runInNewContext(expression, { github, inputs: { full_verification: false } })).toBe('merge-commit')
    expect(runInNewContext(expression, { github, inputs: { full_verification: true } })).toBe('event-head')
  })

  it('benchmark 完整验收保留全部项目和 published 对照，普通源码 PR 保持原性能 guard', () => {
    const { jobs } = workflow('benchmark.yml')
    const matrix = jobs['benchmark-matrix'].steps.find((step: any) => step.id === 'matrix')
    expect(matrix.env.BENCH_EVENT_NAME).toBe('${{ inputs.full_verification && \'workflow_dispatch\' || github.event_name }}')
    expect(matrix.run).toContain('--event "$BENCH_EVENT_NAME"')
    const steps = jobs['benchmark-shard'].steps
    expect(steps.find((step: any) => step.name === 'Run current vs published benchmark').if).toContain('inputs.full_verification')
    expect(steps.find((step: any) => step.name === 'Run pull request performance guard').if).toContain('!inputs.full_verification')
  })

  it('嵌套 PR/SEO 完整校验不能独立冒充顶层稳定汇总', () => {
    expect(workflow('pr-gate.yml').jobs['pr-gate'].name).toContain('inputs.full_verification && \'Version PR checks\'')
    expect(workflow('website-seo-quality.yml').jobs['seo-quality'].name).toContain('inputs.full_verification && \'Version PR SEO verification\'')
  })
})
