import type { createCompilerContext } from '@/context'
import type { IStyleHandlerOptions } from '@/types'
import process from 'node:process'
import { getTailwindV4IncrementalGenerateCacheStats } from '@/tailwindcss/v4-engine'

const GULP_RUNTIME_SOURCE_CACHE_MAX = 256
const GULP_PROCESS_CACHE_MAX = 512

function toMb(bytes: number) {
  return Math.round(bytes / 1024 / 1024)
}

export function touchMapEntry<Key, Value>(map: Map<Key, Value>, key: Key, value: Value) {
  map.delete(key)
  map.set(key, value)
}

export function pruneGulpRuntimeSourceCaches(
  sourcesByFile: Map<string, { source: string, type: 'html' | 'js' }>,
) {
  const removedFiles: string[] = []
  while (sourcesByFile.size > GULP_RUNTIME_SOURCE_CACHE_MAX) {
    const oldestKey = sourcesByFile.keys().next().value
    if (typeof oldestKey !== 'string') {
      break
    }
    sourcesByFile.delete(oldestKey)
    removedFiles.push(oldestKey)
  }
  return removedFiles
}

export function rememberGulpProcessCacheKey(cacheKeys: Set<string>, key: string) {
  cacheKeys.delete(key)
  cacheKeys.add(key)
  while (cacheKeys.size > GULP_PROCESS_CACHE_MAX) {
    const oldestKey = cacheKeys.keys().next().value
    if (typeof oldestKey !== 'string') {
      break
    }
    cacheKeys.delete(oldestKey)
  }
}

export function pruneGulpProcessCache(
  cache: ReturnType<typeof createCompilerContext>['cache'],
  cacheKeys: Set<string>,
) {
  cache.prune?.({
    cacheKeys,
    hashKeys: cacheKeys,
  })
}

export function resolveGulpMemoryDebugStats(context: {
  cache: ReturnType<typeof createCompilerContext>['cache']
  defaultStyleHandlerOptionsCache: Map<number | 'unknown', Partial<IStyleHandlerOptions>>
  gulpProcessCacheKeys: Set<string>
  phase: string
  runtimeSet: Set<string>
  runtimeSourceHashByFile: Map<string, string>
  runtimeSourcesByFile: Map<string, { source: string, type: 'html' | 'js' }>
}) {
  if (process.env['WEAPP_TW_HMR_MEMORY_DEBUG'] !== '1') {
    return undefined
  }

  const memory = process.memoryUsage()
  return {
    phase: context.phase,
    process: {
      rssMb: toMb(memory.rss),
      heapTotalMb: toMb(memory.heapTotal),
      heapUsedMb: toMb(memory.heapUsed),
      externalMb: toMb(memory.external),
      arrayBuffersMb: toMb(memory.arrayBuffers),
    },
    runtime: {
      runtimeSet: context.runtimeSet.size,
      runtimeSourceHashByFile: context.runtimeSourceHashByFile.size,
      runtimeSourcesByFile: context.runtimeSourcesByFile.size,
      maxRuntimeSources: GULP_RUNTIME_SOURCE_CACHE_MAX,
    },
    processCache: {
      instance: context.cache.instance.size,
      hashMap: context.cache.hashMap.size,
      activeCacheKeys: context.gulpProcessCacheKeys.size,
      maxCacheKeys: GULP_PROCESS_CACHE_MAX,
    },
    gulpOptions: {
      defaultStyleHandlerOptions: context.defaultStyleHandlerOptionsCache.size,
    },
    tailwind: {
      v4: getTailwindV4IncrementalGenerateCacheStats(),
    },
  }
}
