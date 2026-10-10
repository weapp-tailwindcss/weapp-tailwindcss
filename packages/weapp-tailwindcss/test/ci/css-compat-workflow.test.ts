import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

function readWorkflow(name: string) {
  return YAML.parse(fs.readFileSync(path.join(root, '.github', 'workflows', name), 'utf8'))
}

function commands(job: { steps: Array<{ run?: string }> }) {
  return job.steps.flatMap(step => step.run ? [step.run] : [])
}

describe('独立 CSS 兼容内核 CI 契约', () => {
  it('在六个 OS/Node 组合验证单测、类型与公开 tarball', () => {
    const workflow = readWorkflow('css-compat.yml')
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
    expect(commands(job)).toEqual([
      'pnpm --filter @weapp-tailwindcss/css-compat build',
      'pnpm --filter @weapp-tailwindcss/css-compat typecheck',
      'pnpm --filter @weapp-tailwindcss/css-compat test --coverage.enabled=false',
      'pnpm --filter @weapp-tailwindcss/css-compat test:package',
    ])
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'packages', 'css-compat', 'package.json'), 'utf8'))
    expect(manifest.scripts.test).toContain('--update=none')
  })

  it('Ubuntu Node 24 固定真实消费、三浏览器、属性数据与基准证据', () => {
    const job = readWorkflow('css-compat.yml').jobs.semantics
    expect(job['runs-on']).toBe('ubuntu-latest')
    expect(job.steps.find((step: { uses?: string }) => step.uses === './.github/actions/setup-pnpm').with['node-version']).toBe(24)
    const runs = commands(job)
    expect(runs).toEqual(expect.arrayContaining([
      'pnpm --filter @weapp-tailwindcss/postcss... run build',
      'pnpm --filter @weapp-tailwindcss/css-compat properties:check',
      'pnpm --filter @weapp-tailwindcss/css-compat test:consumers',
      'pnpm exec playwright install --with-deps chromium chromium-headless-shell firefox webkit',
      'pnpm --filter @weapp-tailwindcss/css-compat test:browser',
    ]))
    expect(job.steps.every((step: Record<string, unknown>) => !step['continue-on-error'])).toBe(true)
    const benchmark = job.steps.find((step: { run?: string }) => step.run?.includes(' tee '))
    expect(benchmark.shell).toBe('bash')
    expect(benchmark.run).toContain('pnpm --filter @weapp-tailwindcss/css-compat bench')
    const artifact = job.steps.find((step: { uses?: string }) => step.uses?.startsWith('actions/upload-artifact@'))
    expect(artifact.if).toBe('always() && !cancelled()')
    expect(artifact.with.path).toBe('.tmp/css-compat/benchmark.log')
    expect(artifact.with.name).toContain('${{ github.sha }}')
    expect(runs.join('\n')).not.toMatch(/e2e:ide|e2e:preflight|publish-packages/)
  })

  it('PR 汇总必须等待新门禁且维持取消生命周期', () => {
    const workflow = readWorkflow('pr-gate.yml')
    const job = workflow.jobs['css-compat']
    expect(job).toMatchObject({
      needs: 'scope',
      if: "needs.scope.outputs.core == 'true'",
      uses: './.github/workflows/css-compat.yml',
    })
    const gate = workflow.jobs['pr-gate']
    expect(gate.if).toBe('always() && !cancelled()')
    expect(gate.needs).toContain('css-compat')
    const step = gate.steps[0]
    expect(step.env.CSS_COMPAT_RESULT).toBe('${{ needs.css-compat.result }}')
    expect(step.run).toMatch(/if test "\$DEMOS_ENABLED" = true; then\s+test "\$DEMOS_RESULT" = success\s+test "\$CSS_COMPAT_RESULT" = success/)
  })

  it('内核源码单独变化仍触发发布产物校验及 main 回归', () => {
    expect(readWorkflow('release-gate.yml').on.pull_request.paths).toContain('packages/css-compat/**')
    const push = readWorkflow('css-compat.yml').on.push
    expect(push.branches).toEqual(['main', 'next'])
    expect(push.paths).toEqual(expect.arrayContaining([
      'packages/css-compat/**',
      'packages/postcss/**',
      'packages/engine/**',
      'scripts/ensure-weapp-tailwindcss-built.mjs',
      'pnpm-lock.yaml',
      '.github/workflows/css-compat.yml',
    ]))
  })
})
