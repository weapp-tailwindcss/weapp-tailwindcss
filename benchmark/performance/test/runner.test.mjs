import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { runIsolatedScenario } from '../src/isolate.mjs'
import { runScenario } from '../src/runner.mjs'
import { resultOf } from '../src/scenarios.mjs'

describe('performance scenario lifecycle', () => {
  it.each([true, false])('keeps fresh=%s semantics and excludes warmup output', async (fresh) => {
    let created = 0
    let executed = 0
    const result = await runScenario({
      id: 'lifecycle',
      fresh,
      async create() {
        created += 1
        return () => String(++executed)
      },
    }, 2, 3)
    expect(created).toBe(fresh ? 5 : 1)
    expect(executed).toBe(5)
    expect(result.sampleCount).toBe(3)
    expect(result.time.count).toBe(3)
    expect(result.outputHashes).toEqual(['3', '4', '5'].map(value => resultOf(value).outputHash))
  })

  it('isolates repeated scenarios while preserving output and requested samples', async () => {
    const config = { groups: ['hmr'], hmrScales: [3] }
    const first = await runIsolatedScenario(config, 'hmr-class-churn-3', 1, 3)
    const second = await runIsolatedScenario(config, 'hmr-class-churn-3', 1, 3)
    expect(first.processId).not.toBe(process.pid)
    expect(second.processId).not.toBe(first.processId)
    expect(first.outputHashes).toHaveLength(1)
    expect(second.outputHashes).toEqual(first.outputHashes)
    expect(second.sampleCount).toBe(3)
    expect(second.time.count).toBe(3)
  }, 30_000)

  it('propagates worker failures rather than returning a partial measurement', async () => {
    await expect(runIsolatedScenario({ groups: ['hmr'] }, 'unknown', 0, 1)).rejects.toThrow('未知性能场景: unknown')
  }, 30_000)
})
