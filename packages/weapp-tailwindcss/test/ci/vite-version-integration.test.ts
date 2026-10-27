/* eslint-disable no-template-curly-in-string -- GitHub Actions 表达式作为测试输入保留。 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { ownershipCollections, viteIntegrationExclude, viteIntegrationFile } from '../../../../scripts/ci/unit-test-ownership.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const workflow = YAML.parse(fs.readFileSync(path.join(repoRoot, '.github', 'workflows', 'pr-gate.yml'), 'utf8'))
const unit = workflow.jobs.quality
const integration = workflow.jobs['vite-integration']

interface Step {
  'name'?: string
  'uses'?: string
  'run'?: string
  'if'?: string
  'with'?: Record<string, unknown>
  'continue-on-error'?: boolean
}

describe('Vite 版本集成测试的独立必需作业', () => {
  it('复用同提交的构建和工具链，保持核心范围与原有内存预算', () => {
    expect(integration.needs).toEqual(['scope', 'prepare-build'])
    expect(integration.if).toBe('needs.scope.outputs.core == \'true\'')
    expect(integration.if).toBe(unit.if)
    expect(integration['runs-on']).toBe(unit['runs-on'])
    expect(integration['timeout-minutes']).toBe(unit['timeout-minutes'])
    expect(integration.steps.slice(0, 3)).toEqual(unit.steps.slice(0, 3))
    expect(integration['continue-on-error']).toBeUndefined()
    const test = integration.steps.find((step: Step) => step.name === 'Vite version integration tests')
    expect(test.run).toBe(`pnpm ci:memory --label pr-gate-vite-integration --max-rss-mb 5632 --max-rss-delta-mb 4608 -- pnpm exec vitest run ${viteIntegrationFile} --maxWorkers=2 --update=none`)
    expect(test['continue-on-error']).toBeUndefined()
    expect(test.if).toBeUndefined()
    expect(integration.steps.filter((step: Step) => step.run).map((step: Step) => step.run).join('\n')).not.toMatch(/pnpm (?:build|install)|--(?:shard|exclude|testNamePattern|passWithNoTests)/)
  })

  it('三单测分片仅迁出一个文件，实际清单门禁与运行参数保持相同选择', () => {
    expect(unit.strategy.matrix.shard).toEqual([1, 2, 3])
    expect(unit.strategy['fail-fast']).toBe(false)
    const test = unit.steps.find((step: Step) => step.name === 'Unit tests')
    expect(test.run).toBe(`pnpm ci:memory --label pr-gate-unit-\${{ matrix.shard }} --max-rss-mb 5632 --max-rss-delta-mb 4608 -- pnpm exec vitest run --shard=\${{ matrix.shard }}/3 --exclude '${viteIntegrationExclude}' --maxWorkers=2 --update=none`)
    const ownership = unit.steps.find((step: Step) => step.name === 'Verify unit and integration test ownership')
    expect(ownership).toMatchObject({ if: 'matrix.shard == 1', run: 'node scripts/ci/unit-test-ownership.mjs' })
    expect(ownership['continue-on-error']).toBeUndefined()
    expect(unit.steps.indexOf(ownership)).toBeLessThan(unit.steps.indexOf(test))
    expect(ownershipCollections()).toEqual([
      ['vitest', 'run', '--maxWorkers=2', '--update=none'],
      ...[1, 2, 3].map(shard => ['vitest', 'run', `--shard=${shard}/3`, '--exclude', viteIntegrationExclude, '--maxWorkers=2', '--update=none']),
      ['vitest', 'run', viteIntegrationFile, '--maxWorkers=2', '--update=none'],
    ])
  })

  it('汇总门禁在核心范围内要求 Vite 作业成功，跳过与失败不能通过', () => {
    const gate = workflow.jobs['pr-gate']
    expect(gate.if).toBe('always() && !cancelled()')
    expect(gate.needs).toContain('vite-integration')
    const step = gate.steps[0]
    expect(step.env.VITE_INTEGRATION_RESULT).toBe('${{ needs.vite-integration.result }}')
    const coreBranch = step.run.slice(step.run.indexOf('if test "$DEMOS_ENABLED" = true; then'), step.run.indexOf('if test "$WATCH_ENABLED" = true; then'))
    expect(coreBranch).toContain('for result in "$QUALITY_RESULT" "$VITE_INTEGRATION_RESULT" "$SMOKE_RESULT" "$DEV_RESULT" "$UTILITIES_RESULT"; do')
    expect(coreBranch).toContain('test "$result" = success')
    expect(coreBranch).not.toMatch(/continue-on-error|\|\| true/)
  })

  it('失败后仍按当前 head、run 与 attempt 保存独立内存证据', () => {
    const steps: Step[] = integration.steps
    const test = steps.find(step => step.name === 'Vite version integration tests')!
    const summary = steps.find(step => step.name === 'Summarize Vite integration memory diagnostics')!
    const upload = steps.find(step => step.name === 'Upload Vite integration memory diagnostics')!
    expect(summary.if).toBe('always()')
    expect(summary.run).toContain('e2e/benchmark/ci-memory/*.md')
    expect(summary.run).toContain('GITHUB_STEP_SUMMARY')
    expect(upload.if).toBe('always()')
    expect(upload.uses).toBe('actions/upload-artifact@v7')
    expect(upload.with).toEqual({
      'name': 'pr-gate-vite-integration-memory-${{ github.event.pull_request.head.sha || github.sha }}-${{ github.run_id }}-${{ github.run_attempt }}',
      'path': 'e2e/benchmark/ci-memory/**',
      'if-no-files-found': 'warn',
      'retention-days': 14,
    })
    expect(steps.indexOf(summary)).toBeGreaterThan(steps.indexOf(test))
    expect(steps.indexOf(upload)).toBeGreaterThan(steps.indexOf(summary))
    for (const job of Object.values(workflow.jobs) as { steps?: Step[] }[]) {
      for (const step of job.steps ?? []) {
        if (step !== upload && step.uses === 'actions/upload-artifact@v7') {
          expect(step.with?.name).not.toBe(upload.with?.name)
        }
      }
    }
  })
})
