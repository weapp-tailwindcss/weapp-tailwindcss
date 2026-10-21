import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runIsolatedScenario } from '../src/isolate.mjs'
import { runScenario } from '../src/runner.mjs'
import { resultOf } from '../src/scenarios.mjs'
import { summarize } from '../src/stats.mjs'

describe('performance scenario lifecycle', () => {
  afterEach(() => vi.restoreAllMocks())

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
    expect(result.samples.map(sample => sample.outputHash)).toEqual(result.outputHashes)
    expect(summarize(result.samples.map(sample => sample.milliseconds))).toEqual(result.time)
  })

  it('preserves ordered measured samples with their memory and output, excluding warmups', async () => {
    const times = [0, 100, 1000, 1200, 2000, 2009, 3000, 3002, 4000, 4005]
    vi.spyOn(performance, 'now').mockImplementation(() => times.shift())
    let memoryCall = 0
    vi.spyOn(process, 'memoryUsage').mockImplementation(() => {
      const sample = Math.floor(memoryCall / 2)
      const after = memoryCall++ % 2
      return { rss: (20 + sample * 2 - after) * 1024 ** 2, heapUsed: (10 + sample * 2 - after * 2) * 1024 ** 2, heapTotal: 0, external: 0, arrayBuffers: 0 }
    })
    let output = 0
    const result = await runScenario({ id: 'ordered', create: async () => () => String(++output) }, 2, 3)
    expect(result.coldMs).toBe(100)
    expect(result.samples).toEqual([9, 2, 5].map((milliseconds, index) => ({
      milliseconds,
      rssMb: 23 + index * 2,
      rssDeltaMb: -1,
      heapDeltaMb: -2,
      outputHash: resultOf(String(index + 3)).outputHash,
    })))
    expect(summarize(result.samples.map(sample => sample.milliseconds))).toEqual(result.time)
    expect(result.time).toEqual({ count: 3, median: 5, p95: 9, p99: 9, min: 2, max: 9 })
  })

  it('retains the sole measured sample without warmups', async () => {
    const result = await runScenario({ id: 'single', create: async () => () => 'single' }, 0, 1)
    expect(result.coldMs).toBeUndefined()
    expect(result.samples).toHaveLength(1)
    expect(result.samples[0].outputHash).toBe(resultOf('single').outputHash)
    expect(result.samples[0].milliseconds).toBe(result.time.median)
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
    for (const result of [first, second]) {
      expect(result.samples).toHaveLength(3)
      for (const sample of result.samples) {
        expect(Number.isFinite(sample.milliseconds)).toBe(true)
        expect(Number.isFinite(sample.rssMb)).toBe(true)
        expect(Number.isFinite(sample.rssDeltaMb)).toBe(true)
        expect(Number.isFinite(sample.heapDeltaMb)).toBe(true)
        expect(sample.outputHash).toBe(result.outputHashes[0])
      }
      expect(summarize(result.samples.map(sample => sample.milliseconds))).toEqual(result.time)
    }
  }, 30_000)

  it('propagates worker failures rather than returning a partial measurement', async () => {
    await expect(runIsolatedScenario({ groups: ['hmr'] }, 'unknown', 0, 1)).rejects.toThrow('未知性能场景: unknown')
  }, 30_000)
})
