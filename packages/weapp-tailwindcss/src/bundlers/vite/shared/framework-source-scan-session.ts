import type { HmrContext } from 'vite'
import type { createViteCssMemory } from '../css-memory'
import type { createViteRuntimeClassSet } from '../runtime-class-set'
import type { createSourceCandidateCollector } from '../source-candidates'
import type { createViteHmrCandidateState, ViteSourceCandidateChange } from './framework-hmr-candidate-state'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { LRUCache } from 'lru-cache'
import { resolveSourceScanPath } from '@/tailwindcss/source-scan'
import { isSourceStyleRequest } from '../../../generation/style-requests'
import { invalidateSourceCandidateScanPreparation, readSourceCandidateScanPreparation, rememberSourceCandidateScanPreparation } from '../../../project-sources/candidates/scan-preparation'
import { createSourceCandidateEligibilityMatcher } from '../../../project-sources/candidates/scan-root'
import { createSourceCandidateScanSignature } from '../source-candidate-scan-signature'
import { resolveViteSourceScanEntries } from '../source-scan'
import { cleanUrl } from '../utils'
import { hasFrameworkHmrRuntimeSourceChange } from './framework-hmr-runtime-signature'
import { createHotUpdateChangeRecorder } from './framework-source-change-recorder'
import { collectSourceScanRoots } from './framework-source-scan-roots'
import { readViteHmrSource } from './hmr-source'

const SOURCE_CANDIDATE_SCAN_CACHE_MAX = 8

type SourceCandidateCollector = ReturnType<typeof createSourceCandidateCollector>
type CssMemory = ReturnType<typeof createViteCssMemory>
type RuntimeState = ReturnType<typeof createViteRuntimeClassSet>['runtimeState']
type HmrCandidateState = ReturnType<typeof createViteHmrCandidateState>
type SourceCandidateScanSnapshot = ReturnType<SourceCandidateCollector['snapshot']>
interface SourceCandidateScanCacheEntry {
  eligibleFiles: string[]
  snapshot: SourceCandidateScanSnapshot
}
interface PendingSourceCandidateFileChange {
  file: string
  source?: string | undefined
  event: 'create' | 'update' | 'delete'
}
type SourceScanResult = NonNullable<Awaited<ReturnType<typeof resolveViteSourceScanEntries>>>

interface FrameworkSourceScanSessionOptions {
  cssMemory: CssMemory
  debug: (...args: any[]) => void
  getResolvedConfig: () => any
  hmrCandidateState: HmrCandidateState
  isCandidateRequest: (id: string) => boolean
  isWatchLikeBuild: () => boolean
  opts: any
  runtimeState: RuntimeState
  shouldOwnTailwindGeneration: boolean
  sourceCandidateCollector: SourceCandidateCollector
}

export async function syncFrameworkSourceCandidatesForHotUpdate(
  sourceScanSession: Pick<ReturnType<typeof createFrameworkSourceScanSession>, 'syncChangedFile' | 'waitForPendingSyncs'>,
  ctx: HmrContext,
) {
  const source = typeof ctx.read === 'function'
    ? await readViteHmrSource(ctx)
    : undefined
  await sourceScanSession.syncChangedFile(ctx.file, source)
  await sourceScanSession.waitForPendingSyncs()
}

export function createFrameworkSourceScanSession(options: FrameworkSourceScanSessionOptions) {
  const sourceCandidateScanCache = new LRUCache<string, SourceCandidateScanCacheEntry>({
    max: SOURCE_CANDIDATE_SCAN_CACHE_MAX,
  })
  let sourceScanEntries: SourceScanResult['entries']
  let sourceScanMatcher: ReturnType<typeof createSourceCandidateEligibilityMatcher> | undefined
  let sourceScanBoundaryMatcher: ReturnType<typeof createSourceCandidateEligibilityMatcher> | undefined
  let sourceScanRoots: ReturnType<typeof collectSourceScanRoots> = []
  let sourceScanOutDir: string | undefined
  let sourceScanEligibleFiles = new Set<string>()
  let sourceScanEligibleFilesRefresh: Promise<void> | undefined
  const sourceScanIneligibleFiles = new Set<string>()
  let sourceScanDependencies = new Set<string>()
  let sourceScanExplicit = false
  let sourceCandidateScanSignature: string | undefined
  let sourceCandidateScanInvalidated = true
  let sourceScanRevision = 0
  let disposed = false
  const pendingSourceCandidateSyncs = new Set<Promise<unknown>>()
  const pendingSourceCandidateSyncByFile = new Map<string, Promise<any>>()
  const pendingHotUpdateChangeByFile = new Map<string, ViteSourceCandidateChange>()
  const rememberHotUpdateChange = createHotUpdateChangeRecorder(pendingHotUpdateChangeByFile)
  const pendingChangedFiles = new Map<string, PendingSourceCandidateFileChange>()
  let pendingChangedFilesFlush: Promise<Map<string, ViteSourceCandidateChange | undefined>> | undefined
  let isFlushingChangedFiles = false
  let cacheDirty = false
  let cachedCollectorRevision: number | undefined

  const normalizeDependency = (file: string) => path.normalize(path.resolve(cleanUrl(file)))
  const isDependency = (file: string) => sourceScanDependencies.has(normalizeDependency(file))
  const preparationKey = (signature = sourceCandidateScanSignature) => signature && options.sourceCandidateCollector.getPreparationKey?.()
    ? JSON.stringify([signature, options.sourceCandidateCollector.getPreparationKey()])
    : undefined
  const invalidateSourceSnapshots = (file?: string) => {
    // 来源事件也会影响暂未启用的扫描配置，不能在切回旧配置时恢复过期候选。
    sourceCandidateScanCache.clear()
    sourceScanRevision++
    invalidateSourceCandidateScanPreparation(preparationKey(), file)
    cachedCollectorRevision = undefined
    cacheDirty = true
  }
  const invalidate = () => {
    sourceCandidateScanInvalidated = true
    sourceScanIneligibleFiles.clear()
    invalidateSourceSnapshots()
  }
  const hasState = () => sourceCandidateScanSignature !== undefined

  const cacheCurrent = () => {
    if (!sourceCandidateScanSignature) {
      return
    }
    if (isFlushingChangedFiles) {
      cacheDirty = true
      return
    }
    const collectorRevision = options.sourceCandidateCollector.getRevision?.()
    if (!cacheDirty
      && cachedCollectorRevision !== undefined
      && collectorRevision === cachedCollectorRevision) {
      return
    }
    const entry = {
      eligibleFiles: [...sourceScanEligibleFiles],
      snapshot: options.sourceCandidateCollector.snapshot(),
    }
    sourceCandidateScanCache.set(sourceCandidateScanSignature, entry)
    const key = preparationKey()
    if (key) {
      rememberSourceCandidateScanPreparation(key, sourceScanRoots.map(root => ({ ...root, outDir: sourceScanOutDir })), sourceScanEligibleFiles, entry.snapshot)
    }
    cachedCollectorRevision = collectorRevision
    cacheDirty = false
  }

  const updateSourceScanMatchers = (eligibleFiles: Iterable<string>) => {
    sourceScanEligibleFiles = new Set(eligibleFiles)
    const matcherRoots = sourceScanRoots.map(scanRoot => ({
      ...scanRoot,
      outDir: sourceScanOutDir,
    }))
    sourceScanBoundaryMatcher = createSourceCandidateEligibilityMatcher(matcherRoots)
    sourceScanMatcher = createSourceCandidateEligibilityMatcher(matcherRoots, sourceScanEligibleFiles)
  }

  const refreshSourceScanEligibleFiles = async () => {
    sourceScanEligibleFilesRefresh ??= Promise.all(sourceScanRoots.map(scanRoot => options.sourceCandidateCollector.resolveScanFiles({
      entries: scanRoot.entries,
      explicit: scanRoot.explicit,
      root: scanRoot.root,
      outDir: sourceScanOutDir,
    })))
      .then(files => updateSourceScanMatchers(files.flat()))
      .finally(() => {
        sourceScanEligibleFilesRefresh = undefined
      })
    await sourceScanEligibleFilesRefresh
  }

  const shouldDiscoverAutoCssSources = (autoCssSourcesDiscovered: boolean) => {
    if (!autoCssSourcesDiscovered || !options.isWatchLikeBuild()) {
      return true
    }
    return sourceCandidateScanInvalidated
  }

  const sync = async (syncOptions: { force?: boolean } = {}): Promise<void> => {
    if (disposed || !options.shouldOwnTailwindGeneration) {
      return
    }
    if (!syncOptions.force && options.isWatchLikeBuild() && hasState() && !sourceCandidateScanInvalidated) {
      options.debug('reuse vite source candidate scan definition for watch rebuild')
      return
    }
    const resolvedConfig = options.getResolvedConfig()
    const revision = sourceScanRevision
    const root = resolvedConfig?.root ?? process.cwd()
    const outDir = resolvedConfig?.build?.outDir
    const sourceScan = await resolveViteSourceScanEntries(options.opts, options.runtimeState.tailwindRuntime, { outDir, root })
    if (disposed || revision !== sourceScanRevision) {
      return disposed ? undefined : sync({ force: true })
    }
    sourceScanEntries = sourceScan?.entries
    sourceScanExplicit = sourceScan?.explicit ?? false
    sourceScanDependencies = new Set((sourceScan?.dependencies ?? []).map(normalizeDependency))
    const roots = collectSourceScanRoots(root, sourceScanEntries, sourceScanExplicit, options.opts)
    sourceScanRoots = roots
    sourceScanOutDir = outDir
    const nextScanSignature = createSourceCandidateScanSignature({
      inlineCandidates: sourceScan?.inlineCandidates,
      outDir,
      roots,
      scanAllSources: !sourceScanExplicit,
    })
    if (hasState() && sourceCandidateScanSignature === nextScanSignature) {
      options.sourceCandidateCollector.syncInline(sourceScan?.inlineCandidates)
      cacheCurrent()
      options.debug('reuse vite source candidate scan for watch rebuild')
      sourceCandidateScanInvalidated = false
      return
    }
    const cachedScan = options.isWatchLikeBuild()
      ? sourceCandidateScanCache.get(nextScanSignature)
      : undefined
    if (cachedScan) {
      options.sourceCandidateCollector.restore(cachedScan.snapshot)
      sourceScanIneligibleFiles.clear()
      updateSourceScanMatchers(cachedScan.eligibleFiles)
      sourceCandidateScanSignature = nextScanSignature
      options.debug('reuse cached vite source candidate scan for watch rebuild')
      sourceCandidateScanInvalidated = false
      return
    }
    const key = options.isWatchLikeBuild() ? preparationKey(nextScanSignature) : undefined
    const prepared = key
      ? await readSourceCandidateScanPreparation(key, async () => (await Promise.all(roots.map(root => options.sourceCandidateCollector.resolveScanFiles({ ...root, outDir })))).flat())
      : undefined
    // await 交接后还可能先运行来源事件；恢复前同步核对本会话与共享准备结果的代次。
    if (disposed || revision !== sourceScanRevision) {
      return disposed ? undefined : sync({ force: true })
    }
    if (prepared?.isCurrent()) {
      options.sourceCandidateCollector.restoreScan(prepared.files)
      options.sourceCandidateCollector.syncInline(sourceScan?.inlineCandidates)
      sourceScanIneligibleFiles.clear()
      updateSourceScanMatchers(prepared.files.map(file => file.id))
      sourceCandidateScanSignature = nextScanSignature
      sourceCandidateScanInvalidated = false
      cacheDirty = true
      cacheCurrent()
      options.debug('reuse validated vite source candidate preparation in independent session')
      return
    }
    if (options.isWatchLikeBuild()) {
      options.sourceCandidateCollector.resetScan()
    }
    else {
      options.sourceCandidateCollector.clearScan()
    }
    options.sourceCandidateCollector.syncInline(sourceScan?.inlineCandidates)
    const eligibleFiles = new Set<string>()
    sourceScanIneligibleFiles.clear()
    await Promise.all(roots.map(scanRoot => options.sourceCandidateCollector.scanRoot({
      entries: scanRoot.entries,
      explicit: scanRoot.explicit,
      root: scanRoot.root,
      outDir,
      onFilesResolved: files => files.forEach(file => eligibleFiles.add(file)),
    })))
    if (disposed || revision !== sourceScanRevision) {
      return disposed ? undefined : sync({ force: true })
    }
    updateSourceScanMatchers(eligibleFiles)
    sourceCandidateScanSignature = nextScanSignature
    sourceCandidateScanInvalidated = false
    if (options.isWatchLikeBuild()) {
      cacheCurrent()
    }
  }

  const waitForPendingSyncs = async () => {
    while (true) {
      if (!pendingChangedFilesFlush && pendingChangedFiles.size === 0 && pendingSourceCandidateSyncs.size === 0) {
        break
      }
      await pendingChangedFilesFlush
      if (pendingChangedFiles.size > 0) {
        await flushChangedFiles()
      }
      if (pendingSourceCandidateSyncs.size > 0) {
        await Promise.all(pendingSourceCandidateSyncs)
      }
    }
  }

  const syncChangedFileNow = async (id: string, sourceOverride?: string, event: PendingSourceCandidateFileChange['event'] = 'update'): Promise<ViteSourceCandidateChange | undefined> => {
    if (!options.shouldOwnTailwindGeneration || !options.isCandidateRequest(id)) {
      return undefined
    }
    const file = cleanUrl(id)
    invalidateSourceSnapshots(file)
    const isCurrent = options.cssMemory.captureSource(file)
    try {
      const runtimeAffectingByDependency = isDependency(file)
      if (runtimeAffectingByDependency) {
        invalidate()
      }
      while (pendingSourceCandidateSyncByFile.has(file)) {
        await pendingSourceCandidateSyncByFile.get(file)
        if (event !== 'delete' && !isCurrent()) {
          return undefined
        }
      }
      if (event === 'delete') {
        const change = options.sourceCandidateCollector.remove(file)
        cacheDirty = true
        const appliedChange = options.hmrCandidateState.apply(options.hmrCandidateState.createChange(file, change, {
          runtimeAffecting: runtimeAffectingByDependency,
        }))
        return rememberHotUpdateChange(appliedChange)
      }
      if (!isCurrent()) {
        return undefined
      }
      const resolvedFile = resolveSourceScanPath(file)
      if (sourceScanMatcher
        && !sourceScanMatcher(file)
        && sourceScanBoundaryMatcher?.(file)
        && !sourceScanIneligibleFiles.has(resolvedFile)) {
        await refreshSourceScanEligibleFiles()
        if (!isCurrent()) {
          return undefined
        }
        if (!sourceScanMatcher(file)) {
          sourceScanIneligibleFiles.add(resolvedFile)
        }
      }
      if (sourceScanMatcher && !sourceScanMatcher(file)) {
        const change = options.sourceCandidateCollector.remove(file)
        cacheCurrent()
        const refresh = isSourceStyleRequest(file)
          ? readFile(file, 'utf8').then((source) => {
              if (isCurrent()) {
                options.cssMemory.refreshRememberedCssSourceBySourceFile(file, source)
              }
            }).catch((error) => {
              const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
              if (code !== 'ENOENT') {
                options.debug('remembered css source watch refresh failed: %s %O', file, error)
              }
            })
          : Promise.resolve()
        return await refresh
          .then(() => isCurrent() ? options.cssMemory.refreshRememberedCssSourceByCurrentFile(file) : undefined)
          .then(() => isCurrent() ? rememberHotUpdateChange(options.hmrCandidateState.apply(options.hmrCandidateState.createChange(file, change, { runtimeAffecting: true }))) : undefined)
      }
      // eligibility 刷新也会让出执行权，提交前再次等待同文件已登记的任务。
      while (pendingSourceCandidateSyncByFile.has(file)) {
        await pendingSourceCandidateSyncByFile.get(file)
        if (!isCurrent()) {
          return undefined
        }
      }
      const previousSource = options.sourceCandidateCollector.source(file)
      const task = (sourceOverride === undefined
        ? options.sourceCandidateCollector.syncCurrentFile(id)
        : options.sourceCandidateCollector.syncCurrentSource(id, sourceOverride))
        .catch((error) => {
          options.debug('source candidate watch sync failed: %s %O', id, error)
          return undefined
        })
        .then((change) => {
          if (!isCurrent()) {
            return undefined
          }
          cacheDirty = true
          if (!isFlushingChangedFiles) {
            cacheCurrent()
          }
          const runtimeAffectingBySource = hasFrameworkHmrRuntimeSourceChange(
            file,
            previousSource,
            options.sourceCandidateCollector.source(file),
          )
          const appliedChange = change
            ? options.hmrCandidateState.apply(options.hmrCandidateState.createChange(file, change, {
                runtimeAffecting: runtimeAffectingByDependency || runtimeAffectingBySource,
              }))
            : undefined
          return rememberHotUpdateChange(appliedChange)
            ?? pendingHotUpdateChangeByFile.get(file)
        })
        .then(async (change) => {
          if (isCurrent()) {
            await options.cssMemory.refreshRememberedCssSourceByCurrentFile(file)
          }
          return change
        })
        .finally(() => {
          pendingSourceCandidateSyncs.delete(task)
          if (pendingSourceCandidateSyncByFile.get(file) === task) {
            pendingSourceCandidateSyncByFile.delete(file)
          }
        })
      pendingSourceCandidateSyncs.add(task)
      pendingSourceCandidateSyncByFile.set(file, task)
      return await task
    }
    finally {
      isCurrent.release()
    }
  }

  const queueChangedFile = (change: Omit<PendingSourceCandidateFileChange, 'file'> & { id: string }) => {
    const file = cleanUrl(change.id)
    invalidateSourceSnapshots(file)
    if (change.event === 'delete') {
      options.cssMemory.removeSource(file)
    }
    else if (change.event === 'create') {
      options.cssMemory.restoreSource(file)
    }
    const previous = pendingChangedFiles.get(file)
    if (!previous) {
      pendingChangedFiles.set(file, { ...change, file })
      return
    }
    previous.event = change.event
    // 每次事件都拥有自己的快照；删除或无快照重建不能沿用上一事件的内容。
    previous.source = change.event === 'delete' ? undefined : change.source
  }

  const flushChangedFiles = async (): Promise<Map<string, ViteSourceCandidateChange | undefined>> => {
    if (pendingChangedFilesFlush) {
      const activeFlush = pendingChangedFilesFlush
      const result = await activeFlush
      return pendingChangedFiles.size > 0 ? flushChangedFiles() : result
    }
    if (pendingChangedFiles.size === 0) {
      return new Map<string, ViteSourceCandidateChange | undefined>()
    }
    const changes = [...pendingChangedFiles.values()]
    pendingChangedFiles.clear()
    isFlushingChangedFiles = true
    pendingChangedFilesFlush = Promise.all(changes.map(async change => [
      change.file,
      await syncChangedFileNow(change.file, change.source, change.event),
    ] as const))
      .then(entries => new Map(entries))
      .finally(() => {
        isFlushingChangedFiles = false
        pendingChangedFilesFlush = undefined
        cacheCurrent()
      })
    return pendingChangedFilesFlush
  }

  const syncChangedFile = async (id: string, sourceOverride?: string): Promise<ViteSourceCandidateChange | undefined> => {
    return syncChangedFileNow(cleanUrl(id), sourceOverride)
  }

  return {
    cacheCurrent,
    async dispose() {
      disposed = true
      sourceScanRevision++
      await pendingChangedFilesFlush?.catch(() => {})
      await sourceScanEligibleFilesRefresh?.catch(() => {})
      await Promise.allSettled(pendingSourceCandidateSyncs)
      pendingChangedFilesFlush = undefined
      sourceScanEligibleFilesRefresh = undefined
      pendingChangedFiles.clear()
      pendingHotUpdateChangeByFile.clear()
      pendingSourceCandidateSyncByFile.clear()
      pendingSourceCandidateSyncs.clear()
      sourceCandidateScanCache.clear()
      sourceScanEligibleFiles.clear()
      sourceScanIneligibleFiles.clear()
      sourceScanDependencies.clear()
      sourceScanEntries = undefined
      sourceScanMatcher = undefined
      sourceScanBoundaryMatcher = undefined
      sourceScanRoots = []
      sourceCandidateScanSignature = undefined
      options.sourceCandidateCollector.clear()
      options.hmrCandidateState.clear()
    },
    consumeHotUpdateChange: (id: string) => pendingHotUpdateChangeByFile.delete(cleanUrl(id)),
    getStats: () => ({
      pendingSourceCandidateSyncByFile: pendingSourceCandidateSyncByFile.size,
      pendingSourceCandidateSyncs: pendingSourceCandidateSyncs.size,
      pendingChangedFiles: pendingChangedFiles.size,
      pendingHotUpdateChangeByFile: pendingHotUpdateChangeByFile.size,
      sourceCandidateScanCache: sourceCandidateScanCache.size,
    }),
    getWatchFiles: () => new Set([...sourceScanEligibleFiles, ...sourceScanDependencies]),
    invalidate,
    isDependency,
    // 首次 source scan 完成前保留 Vite 原有的 transform 行为；sync() 完成后由统一 matcher 负责边界判断。
    matches: (file: string) => sourceScanMatcher?.(file) ?? true,
    queueChangedFile,
    flushChangedFiles,
    shouldDiscoverAutoCssSources,
    sync,
    syncChangedFile,
    waitForPendingSyncs,
  }
}
