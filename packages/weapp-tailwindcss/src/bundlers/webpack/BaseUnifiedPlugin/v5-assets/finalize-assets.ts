import { pushConcurrentTaskFactories } from '../../../../utils/run-tasks'
import { emitHmrTiming } from '../../../shared/hmr-timing'
import {
  pruneWebpackCssHandlerOptionCaches,
  resolveWebpackMemoryDebugStats,
} from './pipeline-helpers'

export * from './pipeline-helpers'

export async function finalizeWebpackProcessAssets(context: any) {
  const { activeProcessCacheKeys, activeProcessHashKeys, activeWebpackCssSourceFiles, compilerOptions, cssAssetResources, cssHandlerOptionsCache, cssTaskFactories, cssUserHandlerOptionsCache, debug, entries, groupedEntries, hmrTimingStartedAt, htmlTaskFactories, jsTaskFactories, pruneWebpackCssSources, recordTimingDetail, registeredWebpackCssSourceFiles, taskConcurrency, tasks, timingDetails, watchMode, webpackSourceCandidateScanCache } = context
  if (!watchMode) {
    pushConcurrentTaskFactories(tasks, htmlTaskFactories, taskConcurrency)
    await Promise.all(tasks)
    tasks.length = 0
    pushConcurrentTaskFactories(tasks, jsTaskFactories, taskConcurrency)
    await Promise.all(tasks)
    tasks.length = 0
    pushConcurrentTaskFactories(tasks, cssTaskFactories, taskConcurrency)
  }

  const taskWaitStartedAt = performance.now()
  await Promise.all(tasks)
  recordTimingDetail('tasks.wait', taskWaitStartedAt)
  const pruneStartedAt = performance.now()
  compilerOptions.cache.prune?.({
    cacheKeys: activeProcessCacheKeys,
    hashKeys: activeProcessHashKeys,
  })
  const activeCssFiles = new Set<string>(groupedEntries.css.map(([file]: [string, unknown]) => file))
  pruneWebpackCssHandlerOptionCaches(
    cssHandlerOptionsCache,
    cssUserHandlerOptionsCache,
    activeCssFiles,
  )
  if (activeCssFiles.size > 0) {
    pruneWebpackCssSources?.(new Set([
      ...registeredWebpackCssSourceFiles,
      ...activeWebpackCssSourceFiles,
      ...[...cssAssetResources.values()].flatMap(resources => [...resources]),
    ]), { watchMode })
  }
  recordTimingDetail('cache.prune', pruneStartedAt)
  debug('end')
  emitHmrTiming('webpack', 'processAssets', performance.now() - hmrTimingStartedAt, {
    ...timingDetails,
    memoryDebug: resolveWebpackMemoryDebugStats({
      activeAssetFiles: entries.length,
      activeCssFiles: activeCssFiles.size,
      activeProcessCacheKeys,
      activeProcessHashKeys,
      cache: compilerOptions.cache,
      cssHandlerOptionsCache,
      cssUserHandlerOptionsCache,
      phase: 'processAssets',
      sourceCandidateScan: webpackSourceCandidateScanCache.getMemoryStats(),
    }),
  })
  compilerOptions.onEnd()
}
