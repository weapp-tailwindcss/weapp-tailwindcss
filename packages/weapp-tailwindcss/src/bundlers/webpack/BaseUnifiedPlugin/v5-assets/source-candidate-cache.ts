import type { SourceCandidateCollectorSnapshot, SourceCandidateStore } from '../../../../project-sources/candidates'
import type { SourceCandidateScanRoot } from '../../../shared/source-candidate-scan-signature'
import type { ResolvedSourceScan } from '../../../shared/source-scan'
import type { TailwindSourceEntry } from '@/tailwindcss/source-scan'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { md5Hash } from '@/cache/md5'
import { resolveSourceScanPath } from '@/tailwindcss/source-scan'
import { isSourceCandidateRequest } from '../../../../project-sources/candidates'
import { forEachSourceCandidateFile, readSourceCandidateFile } from '../../../../project-sources/candidates/file-io'
import { resolveSourceCandidateScanFiles } from '../../../../project-sources/candidates/scan-root'
import { createSourceCandidateScanSignature } from '../../../shared/source-candidate-scan-signature'

export interface WebpackSourceCandidateCacheRecord {
  getSourceCandidatesForEntries: SourceCandidateStore['valuesForEntries']
  signatureHash: string
  tokenSources: ReturnType<SourceCandidateStore['sourcesForEntries']>
}

export interface WebpackSourceCandidateScanMemoryStats {
  entries: number
  files: number
  lastHit: boolean
  signatureHash?: string | undefined
  snapshots: number
}

interface CachedScanFileMeta {
  contentHash: string
  mtimeMs: number
  size: number
}

interface CachedScan {
  files: Map<string, CachedScanFileMeta>
  snapshot: SourceCandidateCollectorSnapshot
}

interface ResolveWebpackSourceCandidateCacheOptions {
  changedFiles?: Iterable<string> | undefined
  collector: SourceCandidateStore
  outDir: string
  root: string
  sourceScan: ResolvedSourceScan | undefined
  watchMode: boolean
}

interface ResolvedScanFileSnapshot {
  meta: CachedScanFileMeta
  source: string
}

const WEBPACK_SOURCE_CANDIDATE_SCAN_CACHE_MAX = 2

function trimScanCache(cache: Map<string, CachedScan>) {
  while (cache.size > WEBPACK_SOURCE_CANDIDATE_SCAN_CACHE_MAX) {
    const oldestKey = cache.keys().next().value
    if (oldestKey === undefined) {
      break
    }
    cache.delete(oldestKey)
  }
}

function collectWebpackSourceCandidateScanRoots(
  root: string,
  entries: TailwindSourceEntry[] | undefined,
  explicit: boolean,
) {
  const dedupedEntries = dedupeSourceEntries(entries)
  if (dedupedEntries?.length) {
    return [{
      entries: dedupedEntries,
      explicit,
      root,
    }]
  }
  if (explicit && dedupedEntries !== undefined) {
    return []
  }
  return [{
    entries: dedupedEntries,
    root,
  }]
}

function dedupeSourceEntries(entries: TailwindSourceEntry[] | undefined) {
  if (!entries?.length) {
    return entries
  }
  const seen = new Set<string>()
  const nextEntries: TailwindSourceEntry[] = []
  for (const entry of entries) {
    const key = JSON.stringify({
      base: path.resolve(entry.base),
      negated: entry.negated,
      pattern: entry.pattern,
    })
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    nextEntries.push(entry)
  }
  return nextEntries
}

function createWebpackSourceCandidateCacheRecord(
  collector: SourceCandidateStore,
  sourceScan: ResolvedSourceScan | undefined,
  signatureHash: string,
): WebpackSourceCandidateCacheRecord {
  return {
    getSourceCandidatesForEntries: (entries, options) => collector.valuesForEntries(entries, options),
    signatureHash,
    tokenSources: collector.sourcesForEntries(sourceScan?.entries),
  }
}

function compactSnapshot(snapshot: SourceCandidateCollectorSnapshot): SourceCandidateCollectorSnapshot {
  return {
    candidatesById: [],
    cssCandidatesById: undefined,
    inlineExcludedCandidates: snapshot.inlineExcludedCandidates,
    inlineIncludedCandidates: snapshot.inlineIncludedCandidates,
    scanCandidatesById: snapshot.scanCandidatesById,
    sourceById: undefined,
    transformCandidatesById: undefined,
  }
}

function normalizeChangedFiles(changedFiles: Iterable<string> | undefined) {
  return new Set(
    [...(changedFiles ?? [])]
      .map(file => resolveSourceScanPath(file)),
  )
}

async function resolveScanFileSnapshot(file: string): Promise<ResolvedScanFileSnapshot | undefined> {
  try {
    const stats = await stat(file)
    const source = await readSourceCandidateFile(file)
    return {
      meta: {
        contentHash: md5Hash(source),
        mtimeMs: stats.mtimeMs,
        size: stats.size,
      },
      source,
    }
  }
  catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined
    if (code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}

function isSameFileMeta(left: CachedScanFileMeta | undefined, right: CachedScanFileMeta | undefined) {
  return left?.contentHash === right?.contentHash
    && left?.mtimeMs === right?.mtimeMs
    && left?.size === right?.size
}

async function resolveScanFiles(roots: SourceCandidateScanRoot[], outDir: string) {
  const files = new Set<string>()
  await Promise.all(roots.map(async (root) => {
    const rootFiles = await resolveSourceCandidateScanFiles({
      entries: root.entries,
      explicit: root.explicit,
      filter: isSourceCandidateRequest,
      outDir,
      root: root.root,
    })
    for (const file of rootFiles) {
      files.add(resolveSourceScanPath(file))
    }
  }))
  return files
}

async function syncChangedScanFiles(
  collector: SourceCandidateStore,
  files: Map<string, CachedScanFileMeta>,
  scanFiles: Set<string>,
  changedFiles: Set<string>,
) {
  for (const file of files.keys()) {
    if (scanFiles.has(file)) {
      continue
    }
    collector.remove(file)
    files.delete(file)
  }

  await forEachSourceCandidateFile(scanFiles, async (file) => {
    const nextSnapshot = await resolveScanFileSnapshot(file)
    if (!nextSnapshot) {
      collector.remove(file)
      files.delete(file)
      return
    }
    const previousMeta = files.get(file)
    if (previousMeta && isSameFileMeta(previousMeta, nextSnapshot.meta) && !changedFiles.has(file)) {
      return
    }
    await collector.sync(file, nextSnapshot.source)
    files.set(file, nextSnapshot.meta)
  })
}

export function createWebpackSourceCandidateScanCache() {
  const scans = new Map<string, CachedScan>()
  let lastHit = false
  let lastSignatureHash: string | undefined

  async function resolve({
    changedFiles,
    collector,
    outDir,
    root,
    sourceScan,
    watchMode,
  }: ResolveWebpackSourceCandidateCacheOptions): Promise<WebpackSourceCandidateCacheRecord> {
    const explicit = sourceScan?.explicit ?? false
    const roots = collectWebpackSourceCandidateScanRoots(root, sourceScan?.entries, explicit)
    const nextSignature = createSourceCandidateScanSignature({
      inlineCandidates: sourceScan?.inlineCandidates,
      outDir,
      roots,
      scanAllSources: !explicit,
    })
    const nextSignatureHash = md5Hash(nextSignature)
    const scanFiles = await resolveScanFiles(roots, outDir)
    const cachedScan = watchMode ? scans.get(nextSignatureHash) : undefined
    if (cachedScan) {
      collector.restore(cachedScan.snapshot)
      collector.syncInline(sourceScan?.inlineCandidates)
      // 失败扫描不能提前发布新元数据，否则重试会把未发布的候选误判为缓存命中。
      const files = new Map(cachedScan.files)
      await syncChangedScanFiles(
        collector,
        files,
        scanFiles,
        normalizeChangedFiles(changedFiles),
      )
      scans.set(nextSignatureHash, { files, snapshot: compactSnapshot(collector.snapshot()) })
      lastHit = true
      lastSignatureHash = nextSignatureHash
      return createWebpackSourceCandidateCacheRecord(collector, sourceScan, nextSignatureHash)
    }

    collector.clearScan()
    collector.syncInline(sourceScan?.inlineCandidates)
    const files = new Map<string, CachedScanFileMeta>()
    await forEachSourceCandidateFile(scanFiles, async (file) => {
      const nextSnapshot = await resolveScanFileSnapshot(file)
      if (!nextSnapshot) {
        return
      }
      await collector.sync(file, nextSnapshot.source)
      files.set(file, nextSnapshot.meta)
    })
    if (watchMode) {
      scans.set(nextSignatureHash, {
        files,
        snapshot: compactSnapshot(collector.snapshot()),
      })
      trimScanCache(scans)
    }
    else {
      scans.clear()
    }
    lastHit = false
    lastSignatureHash = nextSignatureHash
    return createWebpackSourceCandidateCacheRecord(collector, sourceScan, nextSignatureHash)
  }

  function getMemoryStats(): WebpackSourceCandidateScanMemoryStats {
    const cachedScans = [...scans.values()]
    return {
      entries: cachedScans.reduce((count, scan) => count + (scan.snapshot.scanCandidatesById?.length ?? scan.snapshot.candidatesById.length), 0),
      files: cachedScans.reduce((count, scan) => count + scan.files.size, 0),
      lastHit,
      signatureHash: lastSignatureHash,
      snapshots: scans.size,
    }
  }

  return {
    getMemoryStats,
    resolve,
  }
}

export type WebpackSourceCandidateScanCache = ReturnType<typeof createWebpackSourceCandidateScanCache>
