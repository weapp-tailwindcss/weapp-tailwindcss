import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

interface Step {
  name?: string
  run?: string
  if?: string
  uses?: string
  with?: Record<string, unknown>
}

function readWorkflow(filename: string) {
  return YAML.parse(fs.readFileSync(path.join(repoRoot, '.github', 'workflows', filename), 'utf8')) as {
    jobs: Record<string, { steps: Step[], strategy?: { matrix?: { os?: string[] } } }>
  }
}

describe('Actions 失败回归与证据上传', () => {
  it('在三系统生成性能报告前构建 benchmark 的 workspace 依赖闭包', () => {
    const job = readWorkflow('performance-cross-platform.yml').jobs.report!
    const install = job.steps.findIndex(step => step.run === 'pnpm install --frozen-lockfile')
    const build = job.steps.findIndex(step => step.run === "pnpm --filter 'benchmark-performance^...' run build")
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
    ['e2e-focused', "failure() && matrix.case_name == 'lynx-rspeedy'", 'lynx-static-focused-${{ github.run_id }}-${{ github.run_attempt }}'],
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
