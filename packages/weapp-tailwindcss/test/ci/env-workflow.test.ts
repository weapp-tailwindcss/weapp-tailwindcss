import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

function readWorkflow(name: string) {
  return YAML.parse(fs.readFileSync(path.join(root, '.github', 'workflows', name), 'utf8'))
}

describe('独立环境识别包 CI 契约', () => {
  it('在六个 OS/Node 组合校验新包与主包兼容消费', () => {
    const workflow = readWorkflow('env.yml')
    const job = workflow.jobs.portability
    expect(workflow.on).toHaveProperty('workflow_call')
    expect(workflow.env.CI).toBe('1')
    expect(job.strategy['fail-fast']).toBe(false)
    expect(job.strategy.matrix).toEqual({
      os: ['ubuntu-latest', 'macos-latest', 'windows-latest'],
      node: [22, 24],
    })
    expect(job['runs-on']).toBe('${{ matrix.os }}')
    expect(job.steps.find((step: { uses?: string }) => step.uses === './.github/actions/setup-pnpm').with['node-version']).toBe('${{ matrix.node }}')
    expect(job.steps.flatMap((step: { run?: string }) => step.run ? [step.run] : [])).toEqual([
      'pnpm --filter weapp-tailwindcss... run build',
      'pnpm --filter @weapp-tailwindcss/env typecheck',
      'pnpm --filter @weapp-tailwindcss/env test --update=none',
      'pnpm --filter @weapp-tailwindcss/env test:package',
    ])
    expect(job.steps.every((step: Record<string, unknown>) => !step['continue-on-error'])).toBe(true)
  })

  it('PR 汇总要求环境包验证成功并保留取消生命周期', () => {
    const workflow = readWorkflow('pr-gate.yml')
    expect(workflow.jobs.env).toMatchObject({
      needs: 'scope',
      if: "needs.scope.outputs.core == 'true'",
      uses: './.github/workflows/env.yml',
    })
    const gate = workflow.jobs['pr-gate']
    expect(gate.if).toBe('always() && !cancelled()')
    expect(gate.needs).toContain('env')
    const step = gate.steps[0]
    expect(step.env.ENV_RESULT).toBe('${{ needs.env.result }}')
    expect(step.run).toMatch(/if test "\$DEMOS_ENABLED" = true; then[\s\S]*test "\$ENV_RESULT" = success/)
  })

  it('环境源码单独变化仍触发发布校验和 main 回归', () => {
    expect(readWorkflow('release-gate.yml').on.pull_request.paths).toContain('packages/env/**')
    const push = readWorkflow('env.yml').on.push
    expect(push.branches).toEqual(['main', 'next'])
    expect(push.paths).toEqual(expect.arrayContaining([
      'packages/env/**',
      'packages/weapp-tailwindcss/src/framework/**',
      'packages/weapp-tailwindcss/test/ci/env-workflow.test.ts',
      'pnpm-lock.yaml',
      '.github/workflows/env.yml',
    ]))
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
    expect(manifest.scripts['test:release']).toContain('pnpm --filter @weapp-tailwindcss/env typecheck')
  })

  it('PR Gate 的本地复用调用只传入被调用工作流声明的参数', () => {
    const workflow = readWorkflow('pr-gate.yml')
    for (const [name, job] of Object.entries(workflow.jobs) as Array<[string, { uses?: string, with?: Record<string, unknown> }]>) {
      if (!job.uses?.startsWith('./.github/workflows/')) {
        continue
      }
      const called = YAML.parse(fs.readFileSync(path.resolve(root, job.uses), 'utf8'))
      const declared = Object.keys(called.on.workflow_call?.inputs ?? {})
      for (const input of Object.keys(job.with ?? {})) {
        expect(declared, `${name} 不允许传入未声明参数 ${input}`).toContain(input)
      }
    }
  })

  it('完整版本验证向 env 与 CSS 门禁传递审批范围并检出准确 head', () => {
    const env = readWorkflow('env.yml')
    expect(env.on.workflow_call.inputs.full_verification).toMatchObject({ type: 'boolean', default: false })
    expect(env.jobs.scope.with.full_verification).toBe('${{ inputs.full_verification || false }}')
    expect(env.jobs.portability.steps[0].with.ref).toBe('${{ inputs.full_verification && github.event.pull_request.head.sha || github.sha }}')
    const caller = readWorkflow('pr-gate.yml')
    for (const name of ['env', 'css-compat']) {
      expect(caller.jobs[name].with.full_verification).toBe('${{ inputs.full_verification || false }}')
    }
  })
})
