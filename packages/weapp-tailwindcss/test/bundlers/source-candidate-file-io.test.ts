import type { readFile as ReadFile } from 'node:fs/promises'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { setImmediate } from 'node:timers/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWebpackSourceCandidateScanCache } from '@/bundlers/webpack/BaseUnifiedPlugin/v5-assets/source-candidate-cache'
import { createSourceCandidateCollector } from '@/project-sources/candidates'

const io = vi.hoisted(() => ({
  active: 0,
  peak: 0,
  read: undefined as unknown as typeof ReadFile,
  beforeRead: async (_file: string) => {},
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  io.read = actual.readFile
  return { ...actual, readFile: vi.fn(actual.readFile) }
})

describe('源码候选扫描的文件资源边界', () => {
  const roots: string[] = []

  beforeEach(() => {
    io.active = 0
    io.peak = 0
    io.beforeRead = async () => {}
    vi.mocked(readFile).mockImplementation(async (file, options) => {
      io.active++
      io.peak = Math.max(io.peak, io.active)
      try {
        if (io.active > 16) {
          throw Object.assign(new Error('EMFILE: file budget exhausted'), { code: 'EMFILE' })
        }
        await setImmediate()
        await io.beforeRead(String(file))
        return await io.read(file, options)
      }
      finally {
        io.active--
      }
    })
  })

  afterEach(async () => {
    await vi.waitFor(() => expect(io.active).toBe(0))
    await Promise.all(roots.map(root => rm(root, { recursive: true, force: true })))
    roots.length = 0
  })

  async function fixture(count = 80) {
    const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-file-budget-')))
    roots.push(root)
    const files = Array.from({ length: count }, (_, index) => path.join(root, `${index}.tsx`))
    await Promise.all(files.map((file, index) => writeFile(file, `export const cls = "w-[${index}px]"`)))
    const sourceScan = { explicit: true, entries: [{ base: root, pattern: '*.tsx', negated: false }] }
    const collector = () => createSourceCandidateCollector({ extractor: source => source.match(/w-\[\d+px\]/g) ?? [] })
    return {
      files,
      root,
      sourceScan,
      collector,
      options: { outDir: path.join(root, 'dist'), root, sourceScan, watchMode: true },
      expected: new Set(files.map((_, index) => `w-[${index}px]`)),
    }
  }

  it('冷扫描和 watch 命中均在有限文件预算内保留全部候选', async () => {
    const data = await fixture(160)
    const cache = createWebpackSourceCandidateScanCache()
    for (let iteration = 0; iteration < 2; iteration++) {
      const record = await cache.resolve({ ...data.options, collector: data.collector() })
      expect(record.getSourceCandidatesForEntries(data.sourceScan.entries)).toEqual(data.expected)
      expect(cache.getMemoryStats()).toMatchObject({ files: 160, lastHit: iteration > 0, snapshots: 1 })
    }
    expect(io.peak).toBeLessThanOrEqual(16)
  })

  it('多个 cache 与直接 scanRoot 并发时共享文件预算并保持来源隔离', async () => {
    const first = await fixture()
    const second = await fixture()
    const direct = await fixture()
    const directCollector = direct.collector()
    const [left, right] = await Promise.all([
      createWebpackSourceCandidateScanCache().resolve({ ...first.options, collector: first.collector() }),
      createWebpackSourceCandidateScanCache().resolve({ ...second.options, collector: second.collector() }),
      directCollector.scanRoot({ root: direct.root, outDir: direct.options.outDir, entries: direct.sourceScan.entries, explicit: true }),
    ])
    expect(left.getSourceCandidatesForEntries(first.sourceScan.entries)).toEqual(first.expected)
    expect(left.getSourceCandidatesForEntries(second.sourceScan.entries)).toEqual(new Set())
    expect(right.getSourceCandidatesForEntries(second.sourceScan.entries)).toEqual(second.expected)
    expect(directCollector.values()).toEqual(direct.expected)
    expect(io.peak).toBeLessThanOrEqual(16)
  })

  it.each([false, true])('扫描失败先等待在途读取完成，并可重试；watch 命中=%s', async (warm) => {
    const data = await fixture()
    const cache = createWebpackSourceCandidateScanCache()
    if (warm) {
      await cache.resolve({ ...data.options, collector: data.collector() })
      await Promise.all(data.files.map((file, index) => writeFile(file, `export const cls = "w-[${index + 100}px]"`)))
    }
    let release!: () => void
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    let delayed = false
    let started = 0
    let secondReadStarted!: () => void
    const secondRead = new Promise<void>((resolve) => {
      secondReadStarted = resolve
    })
    const failure = Object.assign(new Error('source permission denied'), { code: 'EACCES' })
    io.beforeRead = async () => {
      const index = started++
      if (index === 0) {
        await secondRead
        throw failure
      }
      if (index === 1) {
        delayed = true
        secondReadStarted()
        await blocked
      }
    }
    let settled = false
    const running = cache.resolve({ ...data.options, collector: data.collector() })
      .then(() => {
        settled = true
      }, (error) => {
        settled = true
        return error
      })
    try {
      await vi.waitFor(() => expect(delayed).toBe(true))
      expect(settled).toBe(false)
    }
    finally {
      release()
      await running
    }
    expect(await running).toBe(failure)
    expect(io.active).toBe(0)
    io.beforeRead = async () => {}
    const retry = await cache.resolve({ ...data.options, collector: data.collector() })
    const expected = warm ? new Set(data.files.map((_, index) => `w-[${index + 100}px]`)) : data.expected
    expect(retry.getSourceCandidatesForEntries(data.sourceScan.entries)).toEqual(expected)
  })
})
