import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'
import type { TailwindV4DesignSystem, TailwindV4Engine, TailwindV4GenerateOptions, TailwindV4GenerateTarget, TailwindV4ResolvedSource, TailwindV4SourcePattern } from '../types'
import fs from 'node:fs'
import { collectCustomPropertyValues, mergeCustomPropertyValues } from '@weapp-tailwindcss/postcss/transform'
import { LRUCache } from 'lru-cache'
import { hasCssMacroTailwindV4Source, withCssMacroStyleOptions } from '@/css-macro/auto'
import { shouldUseUniAppWebRpxCompatibility } from '@/runtime-branch/generator-target-env'
import { stableSerialize } from '@/utils/stable-serialize'
import { filterUnsupportedMiniProgramTailwindV4Candidates } from '../candidates'
import { loadTailwindV4DesignSystem } from '../design-system'
import { normalizeRpxLengthCandidates } from './rpx-candidates'

export const INCREMENTAL_GENERATE_CACHE_MAX = 8
export const INCREMENTAL_GENERATE_TASK_CACHE_MAX = 32
export const INCREMENTAL_GENERATE_ENTRY_CANDIDATES_MAX = 12_000
export const INCREMENTAL_GENERATE_ENTRY_CSS_BYTES_MAX = 2 * 1024 * 1024
export const incrementalGenerateCache = new LRUCache<string, TailwindV4IncrementalGenerateCacheEntry>({
  max: INCREMENTAL_GENERATE_CACHE_MAX,
})
export const incrementalGenerateTaskCache = new LRUCache<string, Promise<Awaited<ReturnType<TailwindV4Engine['generate']>>>>({
  max: INCREMENTAL_GENERATE_TASK_CACHE_MAX,
})

interface TailwindV4IncrementalGenerateCacheEntry {
  seenCandidates: Set<string>
  classSet: Set<string>
  css: string
  rawCss: string
  customPropertyValues: Map<string, string>
  designSystemPromise: Promise<TailwindV4DesignSystem>
  dependencies: string[]
  sources: TailwindV4SourcePattern[]
  root: null | 'none' | {
    base: string
    pattern: string
  }
  target: TailwindV4GenerateTarget
}

interface TailwindV4IncrementalCacheSeedOptions {
  compatibleSource: TailwindV4ResolvedSource
  generated: Awaited<ReturnType<TailwindV4Engine['generate']>>
  requestedCandidates: Set<string>
  styleOptions: Partial<IStyleHandlerOptions> | undefined
  target: TailwindV4GenerateTarget
}

export function collectCandidates(candidates: Iterable<string> | undefined) {
  return new Set(candidates ?? [])
}

export function hasRemovedCandidates(previousCandidates: Set<string>, nextCandidates: Set<string>) {
  for (const candidate of previousCandidates) {
    if (!nextCandidates.has(candidate)) {
      return true
    }
  }
  return false
}

function createDependencyFingerprint(files: string[]) {
  return files.map((file) => {
    try {
      const stat = fs.statSync(file)
      return `${file}:${stat.size}:${stat.mtimeMs}`
    }
    catch {
      return `${file}:missing`
    }
  }).join('|')
}

export function createTailwindV4SourceCacheKey(source: TailwindV4ResolvedSource) {
  return [
    source.projectRoot,
    source.base,
    stableSerialize(source.baseFallbacks),
    source.css,
    createDependencyFingerprint(source.dependencies),
  ].join('\0')
}

export function createIncrementalGenerateCacheKey(
  source: TailwindV4ResolvedSource,
  target: TailwindV4GenerateTarget,
  styleOptions: Partial<IStyleHandlerOptions> | undefined,
) {
  return [
    createTailwindV4SourceCacheKey(source),
    target,
    stableSerialize(styleOptions),
  ].join('\0')
}

function createIncrementalGenerateTaskCacheKey(
  cacheKey: string,
  requestedCandidates: Set<string>,
  scanSources: TailwindV4GenerateOptions['scanSources'],
) {
  return [
    cacheKey,
    scanSources === true ? 'scan:1' : 'scan:0',
    [...requestedCandidates].sort().join('\n'),
  ].join('\0')
}

export function runIncrementalGenerateTask(
  cacheKey: string,
  requestedCandidates: Set<string>,
  scanSources: TailwindV4GenerateOptions['scanSources'],
  task: () => Promise<Awaited<ReturnType<TailwindV4Engine['generate']>>>,
) {
  const taskKey = createIncrementalGenerateTaskCacheKey(cacheKey, requestedCandidates, scanSources)
  const cachedTask = incrementalGenerateTaskCache.get(taskKey)
  if (cachedTask) {
    return cachedTask
  }
  const promise = task()
  incrementalGenerateTaskCache.set(taskKey, promise)
  const cleanup = () => {
    if (incrementalGenerateTaskCache.get(taskKey) === promise) {
      incrementalGenerateTaskCache.delete(taskKey)
    }
  }
  // 清理链必须消费拒绝，原始任务仍把错误交给调用方处理。
  void promise.then(cleanup, cleanup)
  return promise
}

function createIncrementalDesignSystemPromise(
  source: TailwindV4ResolvedSource,
  cacheKey: string,
) {
  const promise = loadTailwindV4DesignSystem(source)
  promise.catch(() => {
    const cached = incrementalGenerateCache.get(cacheKey)
    if (cached?.designSystemPromise === promise) {
      incrementalGenerateCache.delete(cacheKey)
    }
  })
  return promise
}

export function resolveTargetCandidates(
  candidates: Iterable<string> | undefined,
  target: TailwindV4GenerateTarget,
) {
  const collected = collectCandidates(candidates)
  return target === 'weapp'
    ? filterUnsupportedMiniProgramTailwindV4Candidates(collected)
    : collected
}

function collectSeenCandidates(
  generated: Pick<Awaited<ReturnType<TailwindV4Engine['generate']>>, 'rawCandidates' | 'classSet'>,
) {
  return new Set([...generated.rawCandidates, ...generated.classSet])
}

export function createIncrementalStyleOptions(
  styleOptions: Partial<IStyleHandlerOptions> | undefined,
): Partial<IStyleHandlerOptions> {
  return {
    ...styleOptions,
    isMainChunk: false,
  }
}

export function resolveStyleOptions(source: TailwindV4ResolvedSource, options: Partial<IStyleHandlerOptions> | undefined) {
  return hasCssMacroTailwindV4Source(source.css) ? withCssMacroStyleOptions(options) : options
}

export { collectCustomPropertyValues, mergeCustomPropertyValues }

function createStableTextSignature(input: string) {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function summarizeIncrementalCacheKey(key: string) {
  return {
    keyHash: createStableTextSignature(key),
    keyBytes: key.length,
  }
}

export function shouldRebuildIncrementalEntry(
  cached: TailwindV4IncrementalGenerateCacheEntry,
  requestedCandidates: Set<string>,
  missingCandidates: string[],
) {
  return cached.seenCandidates.size + missingCandidates.length > INCREMENTAL_GENERATE_ENTRY_CANDIDATES_MAX
    || cached.css.length > INCREMENTAL_GENERATE_ENTRY_CSS_BYTES_MAX
    || cached.rawCss.length > INCREMENTAL_GENERATE_ENTRY_CSS_BYTES_MAX
    || requestedCandidates.size > INCREMENTAL_GENERATE_ENTRY_CANDIDATES_MAX
}

function shouldAdmitIncrementalEntry(
  requestedCandidates: Set<string>,
  generated: {
    css: string
    rawCss: string
  },
) {
  return requestedCandidates.size <= INCREMENTAL_GENERATE_ENTRY_CANDIDATES_MAX
    && generated.css.length <= INCREMENTAL_GENERATE_ENTRY_CSS_BYTES_MAX
    && generated.rawCss.length <= INCREMENTAL_GENERATE_ENTRY_CSS_BYTES_MAX
}

export function seedIncrementalGenerateCache(options: TailwindV4IncrementalCacheSeedOptions) {
  if (!shouldAdmitIncrementalEntry(options.requestedCandidates, options.generated)) {
    return false
  }

  const cacheKey = createIncrementalGenerateCacheKey(
    options.compatibleSource,
    options.target,
    options.styleOptions,
  )
  const customPropertyValues = new Map(options.generated.customPropertyValues ?? [])
  incrementalGenerateCache.set(cacheKey, {
    seenCandidates: collectSeenCandidates(options.generated),
    classSet: new Set(options.generated.classSet),
    css: options.generated.css,
    rawCss: options.generated.rawCss,
    customPropertyValues,
    designSystemPromise: createIncrementalDesignSystemPromise(options.compatibleSource, cacheKey),
    dependencies: options.generated.dependencies,
    sources: options.generated.sources,
    root: options.generated.root,
    target: options.generated.target,
  })
  return true
}

function shouldNormalizeRpxLengthCandidatesForTarget(
  target: TailwindV4GenerateTarget,
  styleOptions: Partial<IStyleHandlerOptions> | undefined,
) {
  if (target !== 'web') {
    return true
  }
  const options = styleOptions as (Partial<IStyleHandlerOptions> & { appType?: string | undefined }) | undefined
  return shouldUseUniAppWebRpxCompatibility(options?.appType)
}

export function normalizeTargetRpxLengthCandidates(
  candidates: Iterable<string>,
  target: TailwindV4GenerateTarget,
  styleOptions: Partial<IStyleHandlerOptions> | undefined,
) {
  return shouldNormalizeRpxLengthCandidatesForTarget(target, styleOptions)
    ? normalizeRpxLengthCandidates(candidates)
    : {
        candidates: new Set(candidates),
        restoreCandidates: new Map<string, string>(),
      }
}
