import { mkdtemp, mkdir, realpath, rm, stat, unlink, utimes, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWebpackSourceCandidateScanCache } from '@/bundlers/webpack/BaseUnifiedPlugin/v5-assets/source-candidate-cache'
import { createSourceCandidateCollector } from '@/project-sources/candidates'

describe('bundlers/webpack source candidate scan cache', () => {
  const createdDirs: string[] = []

  afterEach(async () => {
    await Promise.all(createdDirs.map(dir => rm(dir, { recursive: true, force: true })))
    createdDirs.length = 0
  })

  async function createFixture() {
    const root = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-webpack-source-cache-'))
    createdDirs.push(root)
    const src = path.join(root, 'src')
    await mkdir(src, { recursive: true })
    const pageA = path.join(src, 'a.tsx')
    const pageB = path.join(src, 'b.tsx')
    await writeFile(pageA, 'export const a = "w-1"', 'utf8')
    await writeFile(pageB, 'export const b = "w-2"', 'utf8')
    return {
      pageA: await realpath(pageA),
      pageB: await realpath(pageB),
      root,
    }
  }

  it('reuses watch scan snapshots and syncs changed source files incrementally', async () => {
    const { pageA, pageB, root } = await createFixture()
    const cache = createWebpackSourceCandidateScanCache()
    const scan = {
      entries: [
        {
          base: path.join(root, 'src'),
          negated: false,
          pattern: '**/*.tsx',
        },
        {
          base: path.join(root, 'src'),
          negated: false,
          pattern: '**/*.tsx',
        },
      ],
      explicit: true,
    }

    const firstCollector = createSourceCandidateCollector()
    const firstSync = vi.spyOn(firstCollector, 'sync')
    const first = await cache.resolve({
      collector: firstCollector,
      outDir: path.join(root, 'dist'),
      root,
      sourceScan: scan,
      watchMode: true,
    })
    expect(firstSync).toHaveBeenCalledTimes(2)
    expect(first.signatureHash).toMatch(/^[a-f0-9]{32}$/)
    expect(first.getSourceCandidatesForEntries(scan.entries)).toEqual(new Set(['w-1', 'w-2']))
    expect(cache.getMemoryStats()).toMatchObject({
      files: 2,
      lastHit: false,
      snapshots: 1,
    })
    expect(cache.getMemoryStats().signatureHash).toMatch(/^[a-f0-9]{32}$/)

    const secondCollector = createSourceCandidateCollector()
    const secondSync = vi.spyOn(secondCollector, 'sync')
    const second = await cache.resolve({
      collector: secondCollector,
      outDir: path.join(root, 'dist'),
      root,
      sourceScan: scan,
      watchMode: true,
    })
    expect(secondSync).not.toHaveBeenCalled()
    expect(second.getSourceCandidatesForEntries(scan.entries)).toEqual(new Set(['w-1', 'w-2']))
    expect(cache.getMemoryStats()).toMatchObject({
      files: 2,
      lastHit: true,
      snapshots: 1,
    })

    await writeFile(pageA, 'export const a = "w-3"', 'utf8')
    const thirdCollector = createSourceCandidateCollector()
    const thirdSync = vi.spyOn(thirdCollector, 'sync')
    const third = await cache.resolve({
      changedFiles: [pageA],
      collector: thirdCollector,
      outDir: path.join(root, 'dist'),
      root,
      sourceScan: scan,
      watchMode: true,
    })
    expect(thirdSync).toHaveBeenCalledTimes(1)
    expect(thirdSync).toHaveBeenCalledWith(pageA, 'export const a = "w-3"')
    expect(thirdSync).not.toHaveBeenCalledWith(pageB, expect.any(String))
    expect(third.getSourceCandidatesForEntries(scan.entries)).toEqual(new Set(['w-2', 'w-3']))
    expect(cache.getMemoryStats()).toMatchObject({
      files: 2,
      lastHit: true,
      snapshots: 1,
    })
  })

  it('syncs changed scan files when webpack does not report changed files', async () => {
    const { pageA, root } = await createFixture()
    const cache = createWebpackSourceCandidateScanCache()
    const sourceScan = {
      entries: [
        {
          base: path.join(root, 'src'),
          negated: false,
          pattern: '**/*.tsx',
        },
      ],
      explicit: true,
    }

    const first = await cache.resolve({
      collector: createSourceCandidateCollector(),
      outDir: path.join(root, 'dist'),
      root,
      sourceScan,
      watchMode: true,
    })
    expect(first.getSourceCandidatesForEntries(sourceScan.entries)).toEqual(new Set(['w-1', 'w-2']))

    await new Promise(resolve => setTimeout(resolve, 20))
    await writeFile(pageA, 'export const a = "bg-[#111111]"', 'utf8')

    const secondCollector = createSourceCandidateCollector()
    const secondSync = vi.spyOn(secondCollector, 'sync')
    const second = await cache.resolve({
      collector: secondCollector,
      outDir: path.join(root, 'dist'),
      root,
      sourceScan,
      watchMode: true,
    })

    expect(secondSync).toHaveBeenCalledWith(pageA, 'export const a = "bg-[#111111]"')
    expect(second.getSourceCandidatesForEntries(sourceScan.entries)).toEqual(new Set(['bg-[#111111]', 'w-2']))
  })

  it('syncs same-size source updates even when file timestamps are unchanged', async () => {
    const { pageA, root } = await createFixture()
    const cache = createWebpackSourceCandidateScanCache()
    const sourceScan = {
      entries: [
        {
          base: path.join(root, 'src'),
          negated: false,
          pattern: '**/*.tsx',
        },
      ],
      explicit: true,
    }

    await writeFile(pageA, 'export const a = "bg-[#123]"', 'utf8')
    const originalStats = await stat(pageA)
    const originalModifiedAt = originalStats.mtime

    const first = await cache.resolve({
      collector: createSourceCandidateCollector(),
      outDir: path.join(root, 'dist'),
      root,
      sourceScan,
      watchMode: true,
    })
    expect(first.getSourceCandidatesForEntries(sourceScan.entries)).toEqual(new Set(['bg-[#123]', 'w-2']))

    await writeFile(pageA, 'export const a = "bg-[#124]"', 'utf8')
    await utimes(pageA, originalStats.atime, originalModifiedAt)

    const secondCollector = createSourceCandidateCollector()
    const secondSync = vi.spyOn(secondCollector, 'sync')
    const secondSyncFile = vi.spyOn(secondCollector, 'syncFile')
    const second = await cache.resolve({
      collector: secondCollector,
      outDir: path.join(root, 'dist'),
      root,
      sourceScan,
      watchMode: true,
    })

    expect(secondSync).toHaveBeenCalledWith(pageA, 'export const a = "bg-[#124]"')
    expect(secondSyncFile).not.toHaveBeenCalled()
    expect(second.getSourceCandidatesForEntries(sourceScan.entries)).toEqual(new Set(['bg-[#124]', 'w-2']))
  })

  it('keeps distinct cache records behind short signature hashes', async () => {
    const { root } = await createFixture()
    const cache = createWebpackSourceCandidateScanCache()
    const sourceScan = {
      entries: [
        {
          base: path.join(root, 'src'),
          negated: false,
          pattern: '**/*.tsx',
        },
      ],
      explicit: true,
    }
    const first = await cache.resolve({
      collector: createSourceCandidateCollector(),
      outDir: path.join(root, 'dist'),
      root,
      sourceScan,
      watchMode: true,
    })
    const second = await cache.resolve({
      collector: createSourceCandidateCollector(),
      outDir: path.join(root, 'dist'),
      root,
      sourceScan: {
        ...sourceScan,
        inlineCandidates: {
          excluded: new Set(),
          included: new Set(['inline-token']),
        },
      },
      watchMode: true,
    })

    expect(first.signatureHash).not.toBe(second.signatureHash)
    expect(cache.getMemoryStats()).toMatchObject({
      snapshots: 2,
    })
  })

  it('removes deleted scan files and trims old watch cache snapshots', async () => {
    const { pageA, root } = await createFixture()
    const cache = createWebpackSourceCandidateScanCache()
    const createSourceScan = (pattern: string) => ({
      entries: [{
        base: path.join(root, 'src'),
        negated: false,
        pattern,
      }],
      explicit: true,
    })
    const scan = createSourceScan('**/*.tsx')

    await cache.resolve({
      collector: createSourceCandidateCollector(),
      outDir: path.join(root, 'dist'),
      root,
      sourceScan: scan,
      watchMode: true,
    })
    await unlink(pageA)

    const changedCollector = createSourceCandidateCollector()
    const remove = vi.spyOn(changedCollector, 'remove')
    const second = await cache.resolve({
      changedFiles: [pageA],
      collector: changedCollector,
      outDir: path.join(root, 'dist'),
      root,
      sourceScan: scan,
      watchMode: true,
    })

    expect(remove).toHaveBeenCalledWith(pageA)
    expect(second.getSourceCandidatesForEntries(scan.entries)).toEqual(new Set(['w-2']))

    await cache.resolve({
      collector: createSourceCandidateCollector(),
      outDir: path.join(root, 'dist'),
      root,
      sourceScan: createSourceScan('a.tsx'),
      watchMode: true,
    })
    await cache.resolve({
      collector: createSourceCandidateCollector(),
      outDir: path.join(root, 'dist'),
      root,
      sourceScan: createSourceScan('b.tsx'),
      watchMode: true,
    })

    expect(cache.getMemoryStats().snapshots).toBe(2)
  })

  it('does not keep watch snapshots for explicit empty source entries', async () => {
    const { root } = await createFixture()
    const cache = createWebpackSourceCandidateScanCache()
    const sourceScan = {
      entries: [],
      explicit: true,
    }

    const result = await cache.resolve({
      collector: createSourceCandidateCollector(),
      outDir: path.join(root, 'dist'),
      root,
      sourceScan,
      watchMode: false,
    })

    expect(result.getSourceCandidatesForEntries(sourceScan.entries)).toEqual(new Set())
    expect(cache.getMemoryStats()).toMatchObject({
      files: 0,
      lastHit: false,
      snapshots: 0,
    })
  })
})
