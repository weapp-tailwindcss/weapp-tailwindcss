import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

interface Step {
  'name'?: string
  'run'?: string
  'if'?: string
  'env'?: Record<string, string>
  'id'?: string
  'uses'?: string
  'continue-on-error'?: boolean
  'timeout-minutes'?: number
}

function workflow(name: string) {
  return parse(readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), 'utf8'))
}

describe('hosted E2E workflow contract', () => {
  const watch = workflow('e2e-watch')
  const nightly = watch.jobs['nightly-full-regression']
  const quickGate = watch.jobs['pr-quick-gate']
  const suite = (job: { steps: Step[] }) => job.steps.find(step => step.run === 'pnpm e2e:watch')!

  it('bounds browser setup before both portable catalog and demo execution', () => {
    const portable = workflow('demo-matrix')
    for (const job of [portable.jobs.catalog, portable.jobs.demos]) {
      const steps = job.steps as Step[]
      const browser = steps.findIndex(step => step.uses === './.github/actions/setup-chromium')
      const tests = steps.findIndex(step => step.run === 'pnpm test:demo:matrix' || step.run === 'pnpm e2e:demo:matrix')
      expect(browser).toBeGreaterThan(-1)
      expect(browser).toBeLessThan(tests)
      expect(steps[browser]?.['timeout-minutes']).toBe(5)
      expect(steps[browser]?.['continue-on-error']).not.toBe(true)
      expect(steps.some(step => step.run?.includes('install --with-deps'))).toBe(false)
    }
  })

  it('uses system installation only after a failed Linux probe and still requires rendering', () => {
    const action = parse(readFileSync(new URL('../.github/actions/setup-chromium/action.yml', import.meta.url), 'utf8'))
    const steps = action.runs.steps as Step[]
    expect(steps[0]?.env?.PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT).toBe('30000')
    expect(steps[1]?.id).toBe('probe')
    expect(steps[1]?.['continue-on-error']).toBe(true)
    expect(steps[2]?.if).toBe('steps.probe.outcome == \'failure\' && runner.os == \'Linux\'')
    expect(steps[2]?.run).toContain('APT_CONFIG=')
    expect(steps[2]?.run).toContain('Acquire::http::Timeout "30"')
    expect(steps[2]?.run).toContain('Acquire::https::Timeout "30"')
    expect(steps[2]?.run).toContain('APT::Update::Error-Mode "any"')
    expect(steps.at(-1)?.run).toBe('node scripts/ci/verify-chromium.mjs')
    expect(steps.at(-1)?.if).toBeUndefined()
    expect(steps.at(-1)?.['continue-on-error']).not.toBe(true)
  })

  it('passes the same complete execution profile to quick gate and nightly shards', () => {
    const env = suite(quickGate).env!
    expect(suite(nightly).env).toEqual(env)
    const profileInputs = {
      watch_case: 'E2E_WATCH_CASE',
      watch_web_only: 'E2E_WATCH_WEB_ONLY',
      watch_mini_program_only: 'E2E_WATCH_MINI_PROGRAM_ONLY',
      watch_mini_program_scope: 'E2E_WATCH_MINI_PROGRAM_SCOPE',
      watch_main_style_only: 'E2E_WATCH_MAIN_STYLE_ONLY',
      watch_main_style_subpackage_limit: 'E2E_WATCH_MAIN_STYLE_SUBPACKAGE_LIMIT',
      watch_max_attempts: 'E2E_WATCH_MAX_ATTEMPTS',
      watch_command_timeout_ms: 'E2E_WATCH_COMMAND_TIMEOUT_MS',
      taro_dev_ready_timeout_ms: 'E2E_TARO_DEV_READY_TIMEOUT_MS',
      round_profile: 'E2E_WATCH_ROUND_PROFILE',
    }
    for (const [input, variable] of Object.entries(profileInputs)) {
      expect(env[variable], variable).toContain(`matrix.${input}`)
    }
  })

  it('gives every nightly shard its own report and artifact identity', () => {
    const names = nightly.strategy.matrix.include.map((row: Record<string, string>) =>
      `${row.runner_label}-node${row['node-version'] || 22}-${row.artifact_case || row.watch_case}-${row.round_profile}`,
    )
    expect(new Set(names).size).toBe(names.length)
  })

  it.each([22, 24])('covers all Windows weapp-vite surfaces on Node %i with separate session budgets', (node) => {
    const rows = nightly.strategy.matrix.include.filter((row: Record<string, string>) =>
      row.runner_label === 'windows' && Number(row['node-version'] || 22) === node && row.watch_case === 'weapp-vite-tailwindcss-v4',
    )
    expect(rows.map((row: Record<string, string>) => row.watch_mini_program_scope).sort()).toEqual(['main-package', 'subpackages'])
    const main = rows.find((row: Record<string, string>) => row.watch_mini_program_scope === 'main-package')
    const subpackages = rows.find((row: Record<string, string>) => row.watch_mini_program_scope === 'subpackages')
    expect(Number(subpackages.watch_command_timeout_ms)).toBeGreaterThanOrEqual(2 * Number(main.watch_command_timeout_ms))
    for (const row of rows) {
      expect(row.round_profile).toBe('issue33')
      expect(row.watch_mini_program_only).toBe('1')
      expect(Number(row.watch_timeout_ms)).toBe(Number(main.watch_timeout_ms))
      expect(Number(row.watch_command_timeout_ms)).toBeLessThan(Number(row.timeout_minutes) * 60_000)
    }
  })

  it('partitions the complete hosted static suite on every supported host without dropping tests', () => {
    const job = workflow('e2e-coverage-nightly').jobs['framework-matrix']
    const matrix = job.strategy.matrix
    expect(matrix.host).toEqual([
      { os: 'ubuntu-latest', node: 22 },
      { os: 'macos-15', node: 22 },
      { os: 'windows-latest', node: 22 },
      { os: 'ubuntu-latest', node: 24 },
    ])
    expect(matrix.shard).toEqual([1, 2, 3, 4])
    expect(job['runs-on']).toBe(`\${{ matrix.host.os }}`)
    const steps = job.steps as Step[]
    expect(steps.find(step => step.name === 'Run hosted static suite')?.run).toBe(`pnpm e2e:static --shard=\${{ matrix.shard }}/4`)
    for (const command of ['pnpm e2e:frameworks:matrix', 'pnpm e2e:multiplatform-build']) {
      expect(steps.find(step => step.run === command)?.if).toBe('matrix.shard == 1')
    }
  })
})
