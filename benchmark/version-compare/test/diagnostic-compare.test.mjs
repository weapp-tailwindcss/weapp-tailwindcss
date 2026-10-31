import os from 'node:os'
import path from 'node:path'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { compareDiagnosticInputs } from '../scripts/diagnostics/compare.mjs'

const project = 'demo-weapp-vite-tailwindcss-v4__mp-weixin'
const temporaryDirectories = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('diagnostic input comparison', () => {
  it('weapp-vite input-only 只比较操作输入，不读取 allocation 阶段快照', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'weapp-vite-diagnostic-compare-'))
    temporaryDirectories.push(directory)
    const operation = {
      sequence: 1,
      name: 'engine.build.success',
      phase: { type: 'build-start' },
      details: { input: 'same' },
    }
    for (const role of ['base', 'current']) {
      const session = path.join(directory, `${role}-build-1`)
      const identity = {
        role,
        project,
        mode: 'inputs',
        kind: 'build',
        run: 1,
        root: `/fixture/${role}`,
        platform: 'darwin',
      }
      await mkdir(session, { recursive: true })
      await writeFile(path.join(session, 'operation-1.json'), JSON.stringify(operation), { encoding: 'utf8' })
      await writeFile(path.join(session, 'allocation-controller.json'), JSON.stringify({
        identity,
        operationEvidence: { inputFiles: ['operation-1.json'] },
      }), { encoding: 'utf8' })
    }

    const result = await compareDiagnosticInputs(directory)

    expect(result.inputOnly).toBe(true)
    expect(result.comparisons).toHaveLength(0)
    expect(result.operationComparisons).toHaveLength(1)
    expect(result.operationComparisons[0].sameRecordedOperationsAndInputs).toBe(true)
  })
})
