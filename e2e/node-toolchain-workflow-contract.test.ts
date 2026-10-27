import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

interface Step {
  name?: string
  uses?: string
  if?: string
  with?: {
    'node-version'?: string | number
    'check-latest'?: boolean
  }
}

interface Job {
  steps?: Step[]
  strategy?: { matrix: { include: string } }
}

interface Workflow {
  jobs?: Record<string, Job>
  runs?: { steps?: Step[] }
}

const root = fileURLToPath(new URL('../', import.meta.url))
const files = execFileSync('git', ['ls-files', '-z', '--', '.github/workflows', '.github/actions'], {
  cwd: root,
  encoding: 'utf8',
}).split('\0').filter(file => /\.ya?ml$/.test(file))
const workflows = new Map(files.map(file => [file, parse(readFileSync(resolve(root, file), 'utf8')) as Workflow]))
const setups = [...workflows].flatMap(([file, workflow]) =>
  Object.entries(workflow.jobs ?? { composite: workflow.runs ?? {} }).flatMap(([job, value]) =>
    (value.steps ?? []).filter(step => step.uses?.startsWith('actions/setup-node@')).map(step => ({ file, job, step })),
  ),
)

describe('CI Node.js toolchain contract', () => {
  it('resolves every loose development selector before accepting a hosted runner cache', () => {
    expect(setups.length).toBeGreaterThan(0)
    const violations = setups.filter(({ file, step }) => {
      const version = String(step.with?.['node-version'] ?? '')
      const exactVersion = /^v?\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)
      const runtimeSwitch = file === '.github/workflows/ci.yml' && step.name === 'Switch to the minimum supported runtime'
      return !exactVersion && !runtimeSwitch && step.with?.['check-latest'] !== true
    }).map(({ file, job, step }) => `${file}:${job}: ${step.with?.['node-version'] ?? '(missing selector)'}`)

    expect(violations).toEqual([])
  })

  it.each(['native', 'nightly-consumers'])('preserves explicit minimum ABI runtimes in %s', (name) => {
    const workflow = workflows.get(`.github/workflows/${name}.yml`)!
    const versions = Object.values(workflow.jobs!).flatMap(job =>
      (job.steps ?? []).filter(step => step.uses?.startsWith('actions/setup-node@')).map(step => step.with?.['node-version']),
    )
    expect(versions).toContain('22.18.0')
    expect(versions).toContain('20.19.0')
  })

  it('switches the core compatibility test to its explicit minimum runtime after development setup', () => {
    const job = workflows.get('.github/workflows/ci.yml')!.jobs!.compatibility!
    const runtime = job.steps!.find(step => step.name === 'Switch to the minimum supported runtime')!
    expect(runtime.if).toBe('matrix.scenario == \'node22-min-core\'')
    expect(runtime.with?.['node-version']).toBe(`\${{ matrix.node-version }}`)
    const developmentSetup = job.steps!.findIndex(step => step.uses?.startsWith('actions/setup-node@'))
    expect(developmentSetup).toBeGreaterThan(-1)
    expect(job.steps!.indexOf(runtime)).toBeGreaterThan(developmentSetup)

    const matrices = [...job.strategy!.matrix.include.matchAll(/'(\[[^']*\])'/g)].map(match =>
      JSON.parse(match[1]!) as { 'scenario': string, 'node-version': string | number }[],
    )
    const minimumRows = matrices.flat().filter(row => row.scenario === 'node22-min-core')
    expect(minimumRows.length).toBeGreaterThan(0)
    for (const row of minimumRows) {
      expect(row['node-version']).toBe('22.18.0')
    }
  })
})
