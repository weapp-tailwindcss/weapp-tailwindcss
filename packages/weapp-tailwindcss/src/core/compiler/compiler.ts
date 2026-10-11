import type { CompilerRootSession } from './root-store'
import type {
  Compiler,
  CompilerGenerateRequest,
  CompilerGenerateResult,
  CompilerSnapshot,
  CreateCompilerOptions,
} from './types'
import type { UserDefinedOptions } from '@/types'
import { finalizeMiniProgramCss, finalizeMiniProgramCssRoot } from '@weapp-tailwindcss/postcss/transform'
import { createWeappTailwindcssGenerator } from '@/generator'
import { createCompilerGenerationCacheKey, isSameCompilerGenerationCacheKey, reuseCompilerGenerationResult } from './generation-cache'
import { commitCompilerGeneration, prepareCompilerGeneration } from './generation-state'
import { CompilerRootStore } from './root-store'
import {
  createImmutableSet,
  createRegisteredCompilerSnapshot,
  getInternalCompilerSnapshot,
  mergeRegisteredCompilerSnapshots,
} from './snapshot'
import { resolveCompilerSource } from './source'
import { createCompilerTransforms } from './transforms'

const DEFAULT_MAX_ROOTS = 128

export function createCompiler(options: CreateCompilerOptions = {}): Compiler {
  const { compiler: compilerOptions, ...userOptions } = options
  const maxRoots = Math.max(1, Math.floor(compilerOptions?.maxRoots ?? DEFAULT_MAX_ROOTS))
  const cacheTelemetry = compilerOptions?.cacheTelemetry
  const rootStore = new CompilerRootStore(maxRoots, compilerOptions?.onRootEvicted)
  const activeTasks = new Set<Promise<unknown>>()
  let lifecycle: 'active' | 'disposing' | 'disposed' = 'active'
  let disposePromise: Promise<void> | undefined

  function ensureActive() {
    if (lifecycle !== 'active') {
      throw new Error(lifecycle === 'disposing' ? 'Compiler 正在释放，不能接受新任务。' : 'Compiler 已释放。')
    }
  }

  function track<T>(task: Promise<T>) {
    activeTasks.add(task)
    void task.then(
      () => activeTasks.delete(task),
      () => activeTasks.delete(task),
    )
    return task
  }

  const {
    clearCache: clearTransformCache,
    ...transforms
  } = createCompilerTransforms({
    ensureActive,
    track,
    userOptions: userOptions as UserDefinedOptions,
  })

  async function runGenerate(entry: CompilerRootSession, request: CompilerGenerateRequest): Promise<CompilerGenerateResult> {
    if (!entry.active) {
      throw new Error(`Compiler root 已被移除：${entry.id}`)
    }
    const invalidation = entry.invalidation
    const { source, sourceFingerprint, sourceInputFingerprint } = await resolveCompilerSource(entry, request, invalidation)
    const sourceReused = entry.sourceFingerprint === sourceFingerprint
    const engineReused = sourceReused
      && entry.generator !== undefined
      && entry.appliedInvalidation === invalidation
    const generator = engineReused ? entry.generator! : createWeappTailwindcssGenerator(source)
    const target = request.target ?? 'weapp'
    const {
      id: _id,
      source: _source,
      sourceOptions: _sourceOptions,
      target: _target,
      ...generateOptions
    } = request
    const prepared = prepareCompilerGeneration(
      entry,
      request,
      source,
      !sourceReused || entry.appliedInvalidation !== invalidation,
    )
    const generationCacheKey = createCompilerGenerationCacheKey(
      request,
      prepared.compilation.candidates,
      target,
    )
    const reusableGeneration = request.scanMode !== 'compiled'
      && engineReused
      && entry.generationCache
      && isSameCompilerGenerationCacheKey(entry.generationCache.key, generationCacheKey)
      ? entry.generationCache.result
      : undefined
    const latestRevision = getLatestRevision(entry)
    cacheTelemetry?.record({
      layer: 'tailwind-generation',
      keyFingerprint: generationCacheKey.candidateSignature,
      hit: reusableGeneration !== undefined,
      ...(reusableGeneration === undefined && !engineReused ? { invalidationReason: 'source-change' as const } : {}),
      entries: entry.generationCache ? 1 : 0,
      ...(latestRevision === undefined ? {} : { revision: latestRevision }),
      operationId: entry.id,
    })

    try {
      const generated = reusableGeneration
        ? reuseCompilerGenerationResult(reusableGeneration)
        : await generator.generate({
            ...generateOptions,
            ...(prepared.explicitCandidates ? { candidates: prepared.compilation.candidates } : {}),
            incrementalCache: generateOptions.incrementalCache ?? true,
            target: target === 'tailwind' ? 'web' : target,
          })
      if (!entry.active) {
        throw new Error(`Compiler root 已被移除：${entry.id}`)
      }
      const revision = (getLatestRevision(entry) ?? 0) + 1
      const dependencies = [...new Set([...source.dependencies, ...generated.dependencies])].sort()
      const sources = generated.sources ?? source.sources ?? []
      const previousSnapshotState = entry.latestSnapshot
        ? getInternalCompilerSnapshot(entry.latestSnapshot)
        : undefined
      const reusableClassSet = engineReused
        && generated.incrementalCss === ''
        && previousSnapshotState
        && previousSnapshotState.classSet.size === generated.classSet.size
        && [...generated.classSet].every(candidate => previousSnapshotState.classSet.has(candidate))
        ? previousSnapshotState.classSet
        : undefined
      const reusableClassSetView = reusableClassSet ? entry.latestSnapshot?.classSet : undefined
      const snapshot = createRegisteredCompilerSnapshot({
        classSet: generated.classSet,
        dependencies,
        id: entry.id,
        revision,
        sources,
        target,
      }, reusableClassSet, reusableClassSetView)
      const internalSnapshot = getInternalCompilerSnapshot(snapshot)
      const previousGenerator = entry.generator
      commitCompilerGeneration(entry, prepared, source, dependencies, generated.classSet)
      entry.generator = generator
      entry.generationCache = {
        key: generationCacheKey,
        result: { ...generated, sources: [...snapshot.sources] },
      }
      entry.source = source
      entry.sourceFingerprint = sourceFingerprint
      entry.sourceInputFingerprint = sourceInputFingerprint
      entry.appliedInvalidation = invalidation
      entry.latestSnapshot = snapshot
      rootStore.attachDependencies(entry, dependencies)
      rootStore.attachSources(entry, snapshot.sources)
      if (!engineReused && previousGenerator !== generator) {
        previousGenerator?.dispose?.()
      }
      const css = target === 'tailwind' ? generated.rawCss : generated.css
      const incrementalCss = target === 'tailwind' ? generated.incrementalRawCss : generated.incrementalCss
      return {
        ...generated,
        cache: Object.freeze({
          engine: engineReused,
          output: reusableGeneration !== undefined || (engineReused && incrementalCss === ''),
          source: sourceReused,
        }),
        classSet: snapshot.classSet,
        css,
        dependencies: snapshot.dependencies,
        incrementalCss,
        rawCandidates: createImmutableSet(generated.rawCandidates),
        revision,
        snapshot,
        sources: internalSnapshot.sources,
        target,
      }
    }
    catch (error) {
      if (!engineReused) {
        generator.dispose?.()
      }
      throw error
    }
  }

  function getLatestRevision(entry: CompilerRootSession) {
    return entry.latestSnapshot?.roots[0]?.revision
  }

  function generate(request: CompilerGenerateRequest) {
    ensureActive()
    const entry = rootStore.get(request.id)
    entry.pendingCount += 1
    const execution = entry.pending.then(() => runGenerate(entry, request))
    const settled = execution.finally(() => {
      entry.pendingCount -= 1
      rootStore.trim()
    })
    entry.pending = settled.then(() => undefined, () => undefined)
    return track(execution)
  }

  function createSnapshot(request: Parameters<Compiler['createSnapshot']>[0]) {
    ensureActive()
    return createRegisteredCompilerSnapshot(request)
  }

  function finalizeCss(css: string, options?: Parameters<Compiler['finalizeCss']>[1]) {
    ensureActive()
    return finalizeMiniProgramCss(css, options)
  }

  function finalizeCssRoot(root: Parameters<Compiler['finalizeCssRoot']>[0], options?: Parameters<Compiler['finalizeCssRoot']>[1]) {
    ensureActive()
    const cloned = root.clone()
    finalizeMiniProgramCssRoot(cloned, options)
    return cloned
  }

  function mergeSnapshots(snapshots: Iterable<CompilerSnapshot>) {
    ensureActive()
    return mergeRegisteredCompilerSnapshots(snapshots)
  }

  function invalidate(ids: Iterable<string>) {
    ensureActive()
    return rootStore.invalidate(ids)
  }

  async function remove(id: string) {
    if (lifecycle === 'disposed') {
      return
    }
    clearTransformCache()
    await rootStore.remove(id)
  }

  function dispose() {
    if (disposePromise) {
      return disposePromise
    }
    lifecycle = 'disposing'
    disposePromise = (async () => {
      await Promise.allSettled([...activeTasks])
      clearTransformCache()
      await rootStore.dispose()
      lifecycle = 'disposed'
    })()
    return disposePromise
  }

  return {
    createSnapshot,
    dispose,
    finalizeCss,
    finalizeCssRoot,
    generate,
    invalidate,
    mergeSnapshots,
    remove,
    ...transforms,
  }
}
