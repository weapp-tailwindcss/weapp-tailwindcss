import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildSummary, evaluatePerformanceGuard } from '../scripts/ci-report.mjs'
import { summarizeProcessMemory } from '../scripts/process-memory.mjs'
import { runCase } from '../scripts/run-matrix.mjs'

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), sampler: vi.fn() }))
vi.mock('node:child_process', async importOriginal => ({ ...await importOriginal(), spawn: mocks.spawn }))
vi.mock('../scripts/process-memory.mjs', async importOriginal => ({ ...await importOriginal(), createProcessMemorySampler: mocks.sampler }))

const version = { version: 'current', root: path.join(os.tmpdir(), 'benchmark-artifact-fixture') }
const project = { key: 'build-memory-fixture', project: 'demo', buildScript: 'fixture-build', hmrMode: 'unsupported' }
const options = { buildRuns: 3, hmrRuns: 0, timeoutMs: 1000, pollIntervalMs: 30 }
let memories

function memoryFor(pid, rssMb) {
  return summarizeProcessMemory([0, 250].map((at, index) => ({
    at: 1000 + at,
    rssMb: rssMb + index,
    processCount: 2,
    processes: [
      { pid, ppid: 1, rssMb: 20, command: path.join('中文路径', 'pnpm') },
      { pid: pid + 100, ppid: pid, rssMb: rssMb - 20 + index, command: 'C:\\Program Files\\nodejs\\node.exe' },
    ],
  })))
}

beforeEach(() => {
  let clock = 0
  vi.spyOn(performance, 'now').mockImplementation(() => ++clock)
  memories = [0, 1, 2].map(index => memoryFor(1000 + index, 100 + index))
  mocks.spawn.mockReset().mockImplementation(() => {
    const index = mocks.spawn.mock.calls.length - 1
    const child = Object.assign(new EventEmitter(), {
      pid: 1000 + index,
      exitCode: null,
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
    })
    queueMicrotask(() => {
      child.stdout.emit('data', Buffer.from(`[weapp-tailwindcss:hmr] ${JSON.stringify({ bundler: 'vite', phase: 'total', durationMs: 10 + index })}\n`))
      child.exitCode = 0
      child.emit('close', 0)
    })
    return child
  })
  mocks.sampler.mockReset().mockImplementation(() => {
    const memory = memories[mocks.sampler.mock.calls.length - 1]
    return { stop: () => memory }
  })
})

afterEach(() => vi.restoreAllMocks())

describe('build 原始内存 artifact', () => {
  it('逐轮序列化实际采样根、时序、父子进程和内存汇总，并绑定同轮耗时', async () => {
    const row = JSON.parse(JSON.stringify(await runCase(version, project, options)))

    expect(row.buildMemorySamples).toHaveLength(3)
    expect(row.buildMemorySamples.map(sample => sample.memory)).toEqual(memories)
    expect(row.buildMemorySamples.map(sample => sample.run)).toEqual([1, 2, 3])
    expect(row.buildMemorySamples.map(sample => sample.rootPid)).toEqual([1000, 1001, 1002])
    expect(row.buildMemorySamples.map(sample => sample.durationMs)).toEqual(row.buildMs)
    expect(row.buildMemorySamples.map(sample => sample.pluginProcessMs)).toEqual(row.buildPluginMs)
    expect(row.buildMemorySamples.map(sample => sample.pluginTiming)).toEqual(row.buildPluginTimings)
    expect(row.buildPeakRssMb).toEqual(memories.map(memory => memory.peakRssMb))
    expect(row.buildSteadyRssMb).toEqual(memories.map(memory => memory.steadyRssMb))
    expect(mocks.spawn).toHaveBeenCalledTimes(3)
  })

  it('未采到 RSS 的轮次仍保留空证据，既有统计数组继续只使用有效采样', async () => {
    memories[1] = summarizeProcessMemory([])
    const row = JSON.parse(JSON.stringify(await runCase(version, project, options)))

    expect(row.buildMemorySamples).toHaveLength(3)
    expect(row.buildMemorySamples[1]).toMatchObject({ run: 2, rootPid: 1001, memory: { count: 0, samples: [], peakRssMb: 0, steadyRssMb: 0 } })
    expect(row.buildPeakRssMb).toEqual([memories[0].peakRssMb, memories[2].peakRssMb])
    expect(row.buildSteadyRssMb).toEqual([memories[0].steadyRssMb, memories[2].steadyRssMb])
  })

  it('新增诊断字段不改变旧 raw schema 的汇总和 blocking guard 结论', async () => {
    const baseline = await runCase({ ...version, version: 'base' }, project, options)
    memories.push(...[3, 4, 5].map(index => memoryFor(1000 + index, 200 + index)))
    const current = await runCase(version, project, options)
    const raw = { options, rows: [baseline, current] }
    const legacyRaw = JSON.parse(JSON.stringify(raw))
    for (const row of legacyRaw.rows) {
      delete row.buildMemorySamples
    }

    const summary = buildSummary(raw, 'base', 'current')
    const legacySummary = buildSummary(legacyRaw, 'base', 'current')
    expect(summary).toEqual(legacySummary)
    expect(evaluatePerformanceGuard(summary)).toEqual(evaluatePerformanceGuard(legacySummary))
    expect(evaluatePerformanceGuard(summary).violations.map(violation => violation.metric)).toEqual(['buildPeakRssMb', 'buildSteadyRssMb'])
  })
})
