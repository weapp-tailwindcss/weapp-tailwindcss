/* eslint-disable no-template-curly-in-string -- GitHub Actions 表达式作为测试输入保留。 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

interface Step {
  'name'?: string
  'run'?: string
  'if'?: string
  'uses'?: string
  'with'?: Record<string, unknown>
  'continue-on-error'?: boolean
}

function readWorkflow(filename: string) {
  return YAML.parse(fs.readFileSync(path.join(repoRoot, '.github', 'workflows', filename), 'utf8')) as {
    jobs: Record<string, { steps: Step[], strategy?: { matrix?: { os?: string[] } } }>
  }
}

describe('Actions 失败回归与证据上传', () => {
  it('PR quality 失败后仍汇总并上传当前分片的内存证据，同时保留测试失败状态', () => {
    const job = readWorkflow('pr-gate.yml').jobs.quality!
    const unit = job.steps.find(step => step.name === 'Unit tests')!
    expect(unit['continue-on-error']).not.toBe(true)
    expect(unit.run).toBe('pnpm ci:memory --label pr-gate-unit-${{ matrix.shard }} --max-rss-mb 5632 --max-rss-delta-mb 4608 -- pnpm exec vitest run --shard=${{ matrix.shard }}/3 --maxWorkers=2 --update=none')
    const summary = job.steps.find(step => step.name === 'Summarize unit memory diagnostics')!
    expect(summary).toBeDefined()
    expect(summary.if).toBe('always()')
    expect(summary.run).toContain('GITHUB_STEP_SUMMARY')
    expect(summary.run).toContain('e2e/benchmark/ci-memory')
    const upload = job.steps.find(step => step.name === 'Upload unit memory diagnostics')!
    expect(upload.if).toBe('always()')
    expect(upload.uses).toBe('actions/upload-artifact@v7')
    expect(upload.with).toMatchObject({
      'name': 'pr-gate-unit-memory-${{ matrix.shard }}-${{ github.event.pull_request.head.sha || github.sha }}-${{ github.run_id }}-${{ github.run_attempt }}',
      'path': 'e2e/benchmark/ci-memory/**',
      'if-no-files-found': 'warn',
      'retention-days': 14,
    })
    expect(job.steps.indexOf(summary)).toBeGreaterThan(job.steps.indexOf(unit))
    expect(job.steps.indexOf(upload)).toBeGreaterThan(job.steps.indexOf(summary))
  })

  it('在三系统生成性能报告前构建 benchmark 的 workspace 依赖闭包', () => {
    const job = readWorkflow('performance-cross-platform.yml').jobs.report!
    const install = job.steps.findIndex(step => step.run === 'pnpm install --frozen-lockfile')
    const build = job.steps.findIndex(step => step.run === 'pnpm --filter \'benchmark-performance^...\' run build')
    const report = job.steps.findIndex(step => step.run?.startsWith('pnpm perf:report'))
    expect(job.strategy?.matrix?.os).toEqual(['ubuntu-latest', 'macos-latest', 'windows-latest'])
    expect(install).toBeGreaterThanOrEqual(0)
    expect(build).toBeGreaterThan(install)
    expect(report).toBeGreaterThan(build)
    const upload = job.steps.find(step => step.name === 'Upload cross-platform report')!
    expect(upload.if).toBe('always()')
    expect(upload.with?.['if-no-files-found']).toBe('error')
  })

  it.each([
    ['e2e-static', 'failure()', 'lynx-static-shard-${{ matrix.shard }}-${{ github.run_id }}-${{ github.run_attempt }}'],
    ['e2e-focused', 'failure() && matrix.case_name == \'lynx-rspeedy\'', 'lynx-static-focused-${{ github.run_id }}-${{ github.run_attempt }}'],
  ])('%s 失败后保留隐藏目录下的 Lynx 原始证据', (jobName, condition, artifactName) => {
    const job = readWorkflow('ci.yml').jobs[jobName]!
    const upload = job.steps.find(step => step.name === 'Upload Lynx failure diagnostics')
    expect(upload).toBeDefined()
    expect(upload?.if).toBe(condition)
    expect(upload?.uses).toBe('actions/upload-artifact@v7')
    expect(upload?.with).toMatchObject({
      'name': artifactName,
      'path': 'e2e/.artifacts/lynx-static/**',
      'include-hidden-files': true,
      'if-no-files-found': 'warn',
      'retention-days': 14,
    })
    expect(job.steps.indexOf(upload!)).toBeGreaterThan(job.steps.findIndex(step => step.run?.includes('pnpm ci:memory --label e2e-')))
  })
})
