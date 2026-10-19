import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { recordPreflightRejection } from './tailwind-capabilities/execution-record'
import { executionTargets } from './tailwind-capabilities/plan'

it('预检拒绝保存全部目标的阻塞记录，不能伪造尝试或能力通过', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tailwind-preflight-rejection-'))
  try {
    await recordPreflightRejection(directory, { runId: 'blocked-run', preflight: 'preflight-report.json' }, executionTargets, new Error('device | unavailable\noriginal detail'))
    const report = JSON.parse(await readFile(path.join(directory, 'index.json'), 'utf8'))
    expect(report).toMatchObject({ schemaVersion: 2, runId: 'blocked-run', preflight: 'preflight-report.json' })
    expect(report.stages.map((stage: { target: string }) => stage.target)).toEqual([...executionTargets])
    for (const stage of report.stages) {
      expect(stage).toMatchObject({ status: 'blocked', attempted: false })
      expect(stage.reason).toContain('device | unavailable\noriginal detail')
    }
    const markdown = await readFile(path.join(directory, 'index.md'), 'utf8')
    expect(markdown).toContain('device \\| unavailable original detail')
    expect(markdown).not.toContain('| passed |')
    expect(report).not.toHaveProperty('results')
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
})
