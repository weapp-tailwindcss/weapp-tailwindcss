import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ callback: undefined, clock: 0, writes: [], observe: vi.fn(), disconnect: vi.fn(), close: vi.fn(), write: vi.fn() }))
vi.mock('node:fs', () => ({ default: {
  realpathSync: file => file,
  readFileSync: () => 'private-preload-fixture',
  openSync: () => 123,
  writeSync: mocks.write,
  closeSync: mocks.close,
} }))
vi.mock('node:perf_hooks', () => ({
  constants: { NODE_PERFORMANCE_GC_MAJOR: 4, NODE_PERFORMANCE_GC_MINOR: 1 },
  performance: { timeOrigin: 1000, now: () => ++mocks.clock },
  PerformanceObserver: class {
    constructor(callback) { mocks.callback = callback }
    observe = mocks.observe
    disconnect = mocks.disconnect
  },
}))

let originalArgv
beforeEach(() => {
  vi.resetModules()
  mocks.clock = 0
  mocks.writes.length = 0
  for (const mock of [mocks.observe, mocks.disconnect, mocks.close]) {
    mock.mockReset()
  }
  mocks.write.mockReset().mockImplementation((_fd, data, offset, length) => {
    mocks.writes.push(data.subarray(offset, offset + length).toString())
    return length
  })
  originalArgv = process.argv[1]
  process.argv[1] = path.join(os.tmpdir(), 'mpx-service.mjs')
  vi.stubEnv('WEAPP_TW_BENCH_GC_EXPECTED_ENTRY', process.argv[1])
  vi.stubEnv('WEAPP_TW_BENCH_GC_SESSION', JSON.stringify({ sessionDirectory: os.tmpdir(), role: 'current', project: 'fixture', kind: 'build', run: 1 }))
})
afterEach(() => {
  process.argv[1] = originalArgv
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const entry = { startTime: 1, duration: 2, detail: { kind: 4, flags: 0 } }
function records() {
  return mocks.writes.join('').trimEnd().split('\n').map(line => JSON.parse(line))
}

describe('天然 GC callback 的有界持久化合同', () => {
  it('每 callback 批写，原始计数覆盖截断条目，达到总上限后明确停止而非声称没有 GC', async () => {
    await import('../scripts/gc-preload.mjs')
    for (let batch = 0; batch < 8; batch += 1) {
      mocks.callback({ getEntries: () => Array.from({ length: 300 }).fill(entry) })
    }
    const output = records()
    const accounting = output.findLast(record => record.type === 'accounting')
    expect(accounting).toMatchObject({ observationStopped: true, complete: false, counts: { batchesObserved: 8, eventsObserved: 2400, eventsRecorded: 2048, eventsTruncated: 352, major: 2400 }, costs: { dataWrites: 9 }, accountingCostExcludesCurrentRecord: true })
    expect(output.filter(record => record.type === 'gc-batch').every(record => record.events.length <= 256)).toBe(true)
    expect(Buffer.byteLength(mocks.writes.join(''))).toBeLessThanOrEqual(output[0].limits.maxBytes)
    expect(accounting.costs.dataWriteMsTotal).toBe(9)
    expect(mocks.disconnect).toHaveBeenCalledOnce()
    expect(mocks.close).toHaveBeenCalledWith(123)
  })

  it('短写继续补齐同步完整行，不产生丢失的 NDJSON 后缀', async () => {
    mocks.write.mockImplementation((_fd, data, offset, length) => {
      const written = Math.min(length, 17)
      mocks.writes.push(data.subarray(offset, offset + written).toString())
      return written
    })
    await import('../scripts/gc-preload.mjs')
    mocks.callback({ getEntries: () => [entry] })
    expect(records().map(record => record.type)).toEqual(['process-start', 'gc-batch', 'accounting'])
  })

  it('任何 record 包括 startup 都受统一字节上限约束，初始化失败关闭自己打开的 fd', async () => {
    vi.stubEnv('WEAPP_TW_BENCH_GC_SESSION', JSON.stringify({ sessionDirectory: os.tmpdir(), oversizedIdentity: 'x'.repeat(2 * 1024 * 1024) }))
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    await import('../scripts/gc-preload.mjs')
    expect(mocks.writes).toEqual([])
    expect(mocks.observe).not.toHaveBeenCalled()
    expect(mocks.close).toHaveBeenCalledWith(123)
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('byte limit reached'))
  })

  it('callback 写错显式落盘错误和已观察计数，停止自身 observer 并释放 fd', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    await import('../scripts/gc-preload.mjs')
    vi.mocked(fs.writeSync).mockImplementationOnce(() => {
      throw new Error('fixture ENOSPC')
    })
    mocks.callback({ getEntries: () => [entry] })
    expect(records().findLast(record => record.type === 'recording-error')).toMatchObject({ error: 'fixture ENOSPC', counts: { eventsObserved: 1 } })
    expect(mocks.disconnect).toHaveBeenCalledOnce()
    expect(mocks.close).toHaveBeenCalledWith(123)
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('fixture ENOSPC'))
  })

  it('先短写再抛错也逐字节记账，后续错误记录不能复用已落盘的容量', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    await import('../scripts/gc-preload.mjs')
    const startupBytes = Buffer.byteLength(mocks.writes.join(''))
    mocks.write.mockImplementationOnce((_fd, data, offset) => {
      mocks.writes.push(data.subarray(offset, offset + 17).toString())
      return 17
    }).mockImplementationOnce(() => {
      throw new Error('fixture partial ENOSPC')
    })
    mocks.callback({ getEntries: () => [entry] })
    const errorRecord = JSON.parse(mocks.writes.at(-1))
    expect(errorRecord).toMatchObject({ type: 'recording-error', error: 'fixture partial ENOSPC', costs: { bytesWritten: startupBytes + 17, dataWrites: 1 } })
    expect(Buffer.byteLength(mocks.writes.join(''))).toBeLessThanOrEqual(2 * 1024 * 1024)
    expect(mocks.close).toHaveBeenCalledWith(123)
  })
})
