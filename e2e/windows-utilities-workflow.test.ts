import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const workflow = parse(await readFile(new URL('../.github/workflows/pr-gate.yml', import.meta.url), 'utf8'))
const job = workflow.jobs['windows-utilities']
const name = 'Verify utility command ownership and bounded cleanup'
const files = [
  'windows-owned-process.test.ts',
  'windows-utilities-process.test.ts',
  'windows-utilities-fixture.test.ts',
  'windows-utilities-patches.test.ts',
  'windows-utilities-workflow.test.ts',
]

describe('utility 进程回归的真实平台门禁', () => {
  it('在原四平台矩阵和时限内强制验证完整进程集合，再执行原四阶段构建', () => {
    expect(job.strategy.matrix.include).toEqual([
      { os: 'windows-latest', node: 22 },
      { os: 'windows-latest', node: 24 },
      { os: 'ubuntu-latest', node: 24 },
      { os: 'macos-15', node: 24 },
    ])
    expect(job['timeout-minutes']).toBe(25)
    const step = job.steps.find((item: { name?: string }) => item.name === name)
    expect(step.if).toBeUndefined()
    expect(step['continue-on-error']).toBeUndefined()
    expect(job['continue-on-error']).toBeUndefined()
    expect([...step.run.matchAll(/e2e\/([\w-]+\.test\.ts)/g)].map(match => match[1])).toEqual(files)
    expect(step.run).toContain('--maxWorkers=1 --update=none')
    expect(step.run).not.toMatch(/--(?:exclude|testNamePattern|passWithNoTests|retry|shard|testTimeout)|\|\|\s*true/)
    expect(job.steps.indexOf(step)).toBeLessThan(job.steps.findIndex((item: { run?: string }) => item.run === 'pnpm e2e:windows-utilities'))
    expect(workflow.jobs['pr-gate'].needs).toContain('windows-utilities')
  })
})
