import type { ScanSourceCandidateRootOptions, SourceCandidateCollectorOptions, SourceCandidateCollectorSnapshot, SourceCandidateFilterOptions, SourceCandidateStore } from './types-and-cache'
import type { TailwindInlineSourceCandidates, TailwindSourceEntry } from '@/tailwindcss/source-scan'
import { resolveSourceScanPath } from '@/tailwindcss/source-scan'
import { forEachSourceCandidateFile, readSourceCandidateFile } from './file-io'
import { resolveSourceCandidateScanFiles } from './scan-root'
import { createCandidateSnapshot, restoreCandidateSnapshot } from './snapshot'
import { mergeSourcesByPriority } from './source-priority'
import { addCandidateSet, cleanUrl, createSourceCandidateContentCacheKey, diffCandidateSets, extractCandidates, isSourceCandidateRequest, removeCandidateSet, resolveSourceCandidateExtension, sourceCandidateContentCache } from './types-and-cache'
import { createCandidateViewMemo } from './view-memo'
import { collectCandidateSources, collectCandidateValues } from './views'

const SOURCE_CANDIDATE_FILE_MEMO_MAX = 4096

interface FileCandidateMemo {
  extension: string
  source: string
  candidates: Set<string>
}

type SourceLayer = 'scan' | 'transform' | 'css' | 'module'

interface SourceOwner {
  active: boolean
}

function areSetsEqual(left: Set<string> | undefined, right: Set<string>) {
  if (!left || left.size !== right.size) {
    return false
  }
  for (const value of right) {
    if (!left.has(value)) {
      return false
    }
  }
  return true
}

export function createSourceCandidateStore(options: SourceCandidateCollectorOptions = {}): SourceCandidateStore {
  const candidatesById = new Map<string, Set<string>>()
  const scanCandidatesById = new Map<string, Set<string>>()
  const transformCandidatesById = new Map<string, Set<string>>()
  const cssCandidatesById = new Map<string, Set<string>>()
  const moduleCandidatesById = new Map<string, Set<string>>()
  const scanSourceById = new Map<string, string>()
  const transformSourceById = new Map<string, string>()
  const cssSourceById = new Map<string, string>()
  const moduleSourceById = new Map<string, string>()
  const candidateCount = new Map<string, number>()
  const fileCandidateMemo = new Map<string, FileCandidateMemo>()
  const sourceOwners = new Map<string, Map<SourceLayer, SourceOwner>>()
  const candidateViewMemo = createCandidateViewMemo()
  let inlineIncludedCandidates = new Set<string>()
  let inlineExcludedCandidates = new Set<string>()
  let revision = 0

  async function withSourceOwner<T>(id: string, layer: SourceLayer, action: (owner: SourceOwner) => Promise<T>) {
    const owners = sourceOwners.get(id) ?? new Map<SourceLayer, SourceOwner>()
    const previous = owners.get(layer)
    if (previous) {
      previous.active = false
    }
    const owner: SourceOwner = { active: true }
    owners.set(layer, owner)
    sourceOwners.set(id, owners)
    try {
      return await action(owner)
    }
    finally {
      if (owners.get(layer) === owner) {
        owners.delete(layer)
      }
      if (sourceOwners.get(id) === owners && owners.size === 0) {
        sourceOwners.delete(id)
      }
    }
  }

  function revokeSourceOwners(id: string) {
    for (const owner of sourceOwners.get(id)?.values() ?? []) {
      owner.active = false
    }
    sourceOwners.delete(id)
  }

  async function resolveCandidates(id: string, source: string, extension: string, owner: SourceOwner) {
    const normalizedId = cleanUrl(id)
    const memoKey = `${normalizedId}\0${extension}`
    const memo = fileCandidateMemo.get(memoKey)
    if (memo?.source === source) {
      return new Set(memo.candidates)
    }
    const contentCacheKey = createSourceCandidateContentCacheKey(
      extension,
      source,
      options.bareArbitraryValues,
      options.customAttributesEntities,
      options.disabledDefaultTemplateHandler,
      options.extractor,
    )
    const cachedCandidates = sourceCandidateContentCache.get(contentCacheKey)
    const nextCandidates = cachedCandidates
      ? new Set(cachedCandidates)
      : await extractCandidates(source, extension, options)
    if (!cachedCandidates) {
      sourceCandidateContentCache.set(contentCacheKey, [...nextCandidates])
    }
    if (!owner.active) {
      return new Set<string>()
    }
    fileCandidateMemo.delete(memoKey)
    fileCandidateMemo.set(memoKey, {
      candidates: new Set(nextCandidates),
      extension,
      source,
    })
    while (fileCandidateMemo.size > SOURCE_CANDIDATE_FILE_MEMO_MAX) {
      const oldest = fileCandidateMemo.keys().next().value
      if (oldest === undefined) {
        break
      }
      fileCandidateMemo.delete(oldest)
    }
    return new Set(nextCandidates)
  }

  function isCandidateVisible(candidate: string) {
    if (inlineExcludedCandidates.has(candidate)) {
      return false
    }
    return inlineIncludedCandidates.has(candidate) || candidateCount.has(candidate)
  }

  function collectVisibleCandidates(candidates: Iterable<string>) {
    const visible = new Set<string>()
    for (const candidate of candidates) {
      if (isCandidateVisible(candidate)) {
        visible.add(candidate)
      }
    }
    return visible
  }

  async function syncLayerSource(id: string, source: string, extension: string, owner: SourceOwner, sourceById: Map<string, string>, replaceLayer: (id: string, candidates: Set<string>) => void) {
    const candidates = await resolveCandidates(id, source, extension, owner)
    if (!owner.active) {
      return new Set<string>()
    }
    if (sourceById.get(id) !== source) {
      revision++
    }
    sourceById.set(id, source)
    replaceLayer(id, candidates)
    return candidates
  }

  async function sync(id: string, source: string) {
    const normalizedId = cleanUrl(id)
    await withSourceOwner(normalizedId, 'scan', owner =>
      syncLayerSource(normalizedId, source, resolveSourceCandidateExtension(normalizedId), owner, scanSourceById, replaceScanLayer))
  }

  async function syncCss(id: string, source: string) {
    const normalizedId = cleanUrl(id)
    await withSourceOwner(normalizedId, 'css', owner =>
      syncLayerSource(normalizedId, source, 'css', owner, cssSourceById, replaceCssLayer))
  }

  async function syncModuleSource(id: string, source: string, sourceExtension?: string) {
    const normalizedId = cleanUrl(id)
    const extension = sourceExtension ?? resolveSourceCandidateExtension(normalizedId)
    const candidates = await withSourceOwner(normalizedId, 'module', owner =>
      syncLayerSource(normalizedId, source, extension, owner, moduleSourceById, replaceModuleLayer))
    return new Set(candidates)
  }

  async function merge(id: string, source: string) {
    const normalizedId = cleanUrl(id)
    await withSourceOwner(normalizedId, 'transform', owner =>
      syncLayerSource(normalizedId, source, resolveSourceCandidateExtension(normalizedId), owner, transformSourceById, replaceTransformLayer))
  }

  async function syncFileSource(id: string, current: boolean) {
    const normalizedId = cleanUrl(id)
    return withSourceOwner(normalizedId, 'scan', async (owner) => {
      try {
        const source = await readSourceCandidateFile(normalizedId)
        if (owner.active) {
          if (current) {
            return await syncCurrentSourceWithOwner(normalizedId, source, owner)
          }
          await syncLayerSource(normalizedId, source, resolveSourceCandidateExtension(normalizedId), owner, scanSourceById, replaceScanLayer)
        }
      }
      catch (error) {
        const code = typeof error === 'object' && error !== null && 'code' in error
          ? (error as { code?: unknown }).code
          : undefined
        if (code !== 'ENOENT') {
          throw error
        }
        if (owner.active) {
          return remove(normalizedId)
        }
      }
      return diffCandidateSets(new Set(), new Set())
    })
  }

  async function syncFile(id: string) {
    await syncFileSource(id, false)
  }

  async function syncCurrentSourceWithOwner(normalizedId: string, source: string, owner: SourceOwner) {
    const extension = resolveSourceCandidateExtension(normalizedId)
    const nextCandidates = await resolveCandidates(normalizedId, source, extension, owner)
    if (!owner.active) {
      return diffCandidateSets(new Set(), new Set())
    }
    const previousFileCandidates = new Set(candidatesById.get(normalizedId) ?? [])
    const layerStateChanged = scanSourceById.get(normalizedId) !== source
      || (extension !== 'css' && (transformSourceById.has(normalizedId) || cssSourceById.has(normalizedId) || moduleSourceById.has(normalizedId)))
    if (layerStateChanged) {
      revision++
    }
    const affectedCandidates = new Set([
      ...previousFileCandidates,
      ...nextCandidates,
    ])
    const previousVisibleCandidates = collectVisibleCandidates(affectedCandidates)

    if (extension !== 'css') {
      transformCandidatesById.delete(normalizedId)
      cssCandidatesById.delete(normalizedId)
      moduleCandidatesById.delete(normalizedId)
      transformSourceById.delete(normalizedId)
      cssSourceById.delete(normalizedId)
      moduleSourceById.delete(normalizedId)
    }
    scanSourceById.set(normalizedId, source)
    replaceScanLayer(normalizedId, nextCandidates)

    return diffCandidateSets(
      previousVisibleCandidates,
      collectVisibleCandidates(affectedCandidates),
    )
  }

  async function syncCurrentSource(id: string, source: string) {
    const normalizedId = cleanUrl(id)
    return withSourceOwner(normalizedId, 'scan', owner => syncCurrentSourceWithOwner(normalizedId, source, owner))
  }

  async function syncCurrentFile(id: string) {
    return syncFileSource(id, true)
  }

  async function resolveScanFiles({ entries, explicit, root, outDir }: ScanSourceCandidateRootOptions) {
    const files = await resolveSourceCandidateScanFiles({
      entries,
      explicit,
      filter: isSourceCandidateRequest,
      outDir,
      root,
    })
    return files.map(resolveSourceScanPath)
  }

  async function scanRoot(options: ScanSourceCandidateRootOptions) {
    const resolvedFiles = await resolveScanFiles(options)
    options.onFilesResolved?.(resolvedFiles)
    await forEachSourceCandidateFile(resolvedFiles, syncFile)
  }

  function replaceFinal(id: string, nextCandidates: Set<string>) {
    const normalizedId = cleanUrl(id)
    const previousCandidates = candidatesById.get(normalizedId)
    if (areSetsEqual(previousCandidates, nextCandidates)) {
      return
    }
    revision++
    if (previousCandidates) {
      removeCandidateSet(candidateCount, previousCandidates)
      candidatesById.delete(normalizedId)
    }
    if (nextCandidates.size === 0) {
      return
    }
    candidatesById.set(normalizedId, nextCandidates)
    addCandidateSet(candidateCount, nextCandidates)
  }

  function replaceScanLayer(id: string, nextCandidates: Set<string>) {
    const normalizedId = cleanUrl(id)
    if (nextCandidates.size === 0) {
      scanCandidatesById.delete(normalizedId)
    }
    else {
      scanCandidatesById.set(normalizedId, nextCandidates)
    }
    recompute(normalizedId)
  }

  function replaceTransformLayer(id: string, nextCandidates: Set<string>) {
    const normalizedId = cleanUrl(id)
    if (nextCandidates.size === 0) {
      transformCandidatesById.delete(normalizedId)
    }
    else {
      transformCandidatesById.set(normalizedId, nextCandidates)
    }
    recompute(normalizedId)
  }

  function replaceCssLayer(id: string, nextCandidates: Set<string>) {
    const normalizedId = cleanUrl(id)
    if (nextCandidates.size === 0) {
      cssCandidatesById.delete(normalizedId)
    }
    else {
      cssCandidatesById.set(normalizedId, nextCandidates)
    }
    recompute(normalizedId)
  }

  function replaceModuleLayer(id: string, nextCandidates: Set<string>) {
    const normalizedId = cleanUrl(id)
    if (nextCandidates.size === 0) {
      moduleCandidatesById.delete(normalizedId)
    }
    else {
      moduleCandidatesById.set(normalizedId, nextCandidates)
    }
    recompute(normalizedId)
  }

  function recompute(id: string) {
    const normalizedId = cleanUrl(id)
    const nextCandidates = new Set([
      ...(scanCandidatesById.get(normalizedId) ?? []),
      ...(transformCandidatesById.get(normalizedId) ?? []),
      ...(cssCandidatesById.get(normalizedId) ?? []),
      ...(moduleCandidatesById.get(normalizedId) ?? []),
    ])
    replaceFinal(normalizedId, nextCandidates)
  }

  function syncInline(inlineCandidates: TailwindInlineSourceCandidates | undefined) {
    const nextIncluded = new Set(inlineCandidates?.included ?? [])
    const nextExcluded = new Set(inlineCandidates?.excluded ?? [])
    if (!areSetsEqual(inlineIncludedCandidates, nextIncluded) || !areSetsEqual(inlineExcludedCandidates, nextExcluded)) {
      revision++
    }
    inlineIncludedCandidates = nextIncluded
    inlineExcludedCandidates = nextExcluded
  }

  function remove(id: string) {
    const normalizedId = cleanUrl(id)
    revokeSourceOwners(normalizedId)
    const hadState = candidatesById.has(normalizedId)
      || scanCandidatesById.has(normalizedId)
      || transformCandidatesById.has(normalizedId)
      || cssCandidatesById.has(normalizedId)
      || moduleCandidatesById.has(normalizedId)
      || scanSourceById.has(normalizedId)
      || transformSourceById.has(normalizedId)
      || cssSourceById.has(normalizedId)
      || moduleSourceById.has(normalizedId)
    const affectedCandidates = new Set(candidatesById.get(normalizedId) ?? [])
    const previousVisibleCandidates = collectVisibleCandidates(affectedCandidates)
    scanCandidatesById.delete(normalizedId)
    transformCandidatesById.delete(normalizedId)
    cssCandidatesById.delete(normalizedId)
    moduleCandidatesById.delete(normalizedId)
    scanSourceById.delete(normalizedId)
    transformSourceById.delete(normalizedId)
    cssSourceById.delete(normalizedId)
    moduleSourceById.delete(normalizedId)
    for (const key of fileCandidateMemo.keys()) {
      if (key.startsWith(`${normalizedId}\0`)) {
        fileCandidateMemo.delete(key)
      }
    }
    const previousCandidates = candidatesById.get(normalizedId)
    if (!previousCandidates) {
      if (hadState) {
        revision++
      }
      return diffCandidateSets(previousVisibleCandidates, new Set())
    }
    removeCandidateSet(candidateCount, previousCandidates)
    candidatesById.delete(normalizedId)
    revision++
    return diffCandidateSets(
      previousVisibleCandidates,
      collectVisibleCandidates(affectedCandidates),
    )
  }

  function source(id: string) {
    const normalizedId = cleanUrl(id)
    return scanSourceById.get(normalizedId)
      ?? cssSourceById.get(normalizedId)
      ?? transformSourceById.get(normalizedId)
      ?? moduleSourceById.get(normalizedId)
  }

  function sources() {
    return mergeSourcesByPriority(moduleSourceById, transformSourceById, cssSourceById, scanSourceById).entries()
  }

  function values() {
    return collectCandidateValues({ candidatesById, moduleCandidatesById, candidateCount, inlineIncludedCandidates, inlineExcludedCandidates })
  }

  function valuesForEntries(entries: TailwindSourceEntry[] | undefined, options: SourceCandidateFilterOptions = {}) {
    return candidateViewMemo('values', revision, entries, options.excludeEntries, () =>
      collectCandidateValues({ candidatesById, moduleCandidatesById, candidateCount, inlineIncludedCandidates, inlineExcludedCandidates }, entries, options.excludeEntries))
  }

  function sourcesForEntries(entries: TailwindSourceEntry[] | undefined, options: SourceCandidateFilterOptions = {}) {
    return candidateViewMemo('sources', revision, entries, options.excludeEntries, () =>
      collectCandidateSources({ candidatesById, moduleCandidatesById, candidateCount, inlineIncludedCandidates, inlineExcludedCandidates }, entries, options.excludeEntries))
  }

  function clear() {
    for (const id of sourceOwners.keys()) {
      revokeSourceOwners(id)
    }
    if (candidateCount.size > 0 || fileCandidateMemo.size > 0 || inlineIncludedCandidates.size > 0 || inlineExcludedCandidates.size > 0) {
      revision++
    }
    candidatesById.clear()
    scanCandidatesById.clear()
    transformCandidatesById.clear()
    cssCandidatesById.clear()
    moduleCandidatesById.clear()
    scanSourceById.clear()
    transformSourceById.clear()
    cssSourceById.clear()
    moduleSourceById.clear()
    candidateCount.clear()
    inlineIncludedCandidates.clear()
    inlineExcludedCandidates.clear()
    fileCandidateMemo.clear()
  }

  function clearScan() {
    const hadState = scanCandidatesById.size > 0 || inlineIncludedCandidates.size > 0 || inlineExcludedCandidates.size > 0
    for (const id of scanCandidatesById.keys()) {
      scanCandidatesById.delete(id)
      recompute(id)
    }
    inlineIncludedCandidates.clear()
    inlineExcludedCandidates.clear()
    if (hadState) {
      revision++
    }
  }

  function resetScan() {
    const hadState = inlineIncludedCandidates.size > 0 || inlineExcludedCandidates.size > 0
    inlineIncludedCandidates.clear()
    inlineExcludedCandidates.clear()
    if (hadState) {
      revision++
    }
  }

  function snapshot(): SourceCandidateCollectorSnapshot {
    return createCandidateSnapshot({ candidatesById, scanCandidatesById, transformCandidatesById, cssCandidatesById, moduleCandidatesById, scanSourceById, transformSourceById, cssSourceById, moduleSourceById, inlineIncludedCandidates, inlineExcludedCandidates })
  }

  function restore(snapshot: SourceCandidateCollectorSnapshot) {
    restoreCandidateSnapshot({ candidatesById, scanCandidatesById, transformCandidatesById, cssCandidatesById, moduleCandidatesById, scanSourceById, transformSourceById, cssSourceById, moduleSourceById, inlineIncludedCandidates, inlineExcludedCandidates }, snapshot, clear, recompute, (included, excluded) => {
      inlineIncludedCandidates = included
      inlineExcludedCandidates = excluded
    })
  }

  return {
    syncSource: sync,
    sync,
    syncCss,
    syncModuleSource,
    merge,
    syncFile,
    syncCurrentSource,
    syncCurrentFile,
    resolveScanFiles,
    scanRoot,
    syncInline,
    remove,
    source,
    sources,
    values,
    valuesForEntries,
    sourcesForEntries,
    snapshot,
    restore,
    clearScan,
    resetScan,
    clear,
    getRevision: () => revision,
  }
}
