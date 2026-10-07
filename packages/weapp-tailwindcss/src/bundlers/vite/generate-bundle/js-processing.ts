import type { OutputAsset, OutputChunk } from 'rollup'
import type { BundleSnapshot, BundleStateEntry } from '../bundle-state'
import type { BundleMetrics } from './metrics'
import type { GenerateBundleContext } from './types'
import type { CreateJsHandlerOptions, LinkedJsModuleResult } from '@/types'
import path from 'node:path'
import { logger } from '@/logger'
import { createUniAppXBundleAssetSourceGetter, UNI_APP_X_STYLE_PLACEHOLDER_VERSION } from '@/uni-app-x/style-asset'
import { createUniAppXAssetTask } from '@/uni-app-x/vite'
import { processCachedTask } from '../../shared/cache'
import { shouldSkipViteJsTransform } from '../js-precheck'
import { resolveUniAppXJsTransformEnabled } from './js-handler-options'
import { collectLinkedFileNames } from './js-linking'
import { measureElapsed } from './metrics'
import { createJsHashSalt, createLinkedImpactSignature, getSnapshotHash } from './signatures'

interface ProcessJsBundleEntryOptions {
  applyLinkedUpdates: (linked?: Record<string, LinkedJsModuleResult>) => void
  bundle: Record<string, OutputAsset | OutputChunk>
  cache: GenerateBundleContext['opts']['cache']
  createHandlerOptions: (absoluteFilename: string, extra?: CreateJsHandlerOptions) => CreateJsHandlerOptions
  debug: GenerateBundleContext['debug']
  disableJsPrecheck: boolean
  entry: BundleStateEntry
  getJsEntry: ReturnType<typeof import('./js-entries').createJsEntryResolver>
  deferUniAppXStylePlaceholder?: boolean
  jsHandler: GenerateBundleContext['opts']['jsHandler']
  jsTaskFactories: Array<() => Promise<void>>
  linkedByEntry: Map<string, Set<string>> | undefined
  metrics: BundleMetrics
  onUpdate: GenerateBundleContext['opts']['onUpdate']
  outDir: string
  processFiles: BundleSnapshot['processFiles']
  rememberProcessCacheKey: (cacheKey: string, hashKey?: string | number) => void
  runtimeSignature: string
  snapshot: BundleSnapshot
  shouldSkipAstTransform: ((chunk: OutputChunk) => boolean) | undefined
  slowJsAstWarnMs: number
  timeTask: (name: string, task: () => Promise<void>) => Promise<void>
  transformRuntime: Set<string>
  transformRuntimeSignature: string
  transformFilterSignature: string
  uniAppX: GenerateBundleContext['opts']['uniAppX']
  useIncrementalMode: boolean
}

interface ReplayCleanJsBundleEntryOptions {
  cache: GenerateBundleContext['opts']['cache']
  debug: GenerateBundleContext['debug']
  entry: BundleStateEntry
  metrics: BundleMetrics
  rememberProcessCacheKey: (cacheKey: string, hashKey?: string | number) => void
  snapshot: BundleSnapshot
  transformFilterSignature: string
  transformRuntimeSignature: string
  useIncrementalMode: boolean
}

/** 在增量构建中直接回放 clean chunk，避免创建完整 JS 处理任务。 */
export function replayCleanJsBundleEntry(options: ReplayCleanJsBundleEntryOptions) {
  const { cache, debug, entry, metrics, rememberProcessCacheKey, snapshot, transformFilterSignature, transformRuntimeSignature, useIncrementalMode } = options
  if (!useIncrementalMode || entry.output.type !== 'chunk' || snapshot.processFiles.js.has(entry.file)) {
    return false
  }
  const hashKey = `${entry.file}:js`
  const sourceHash = snapshot.sourceHashByFile.get(entry.file) ?? cache.computeHash(entry.source)
  const processHash = `${sourceHash}:${transformRuntimeSignature}:transform-filter:${transformFilterSignature}`
  rememberProcessCacheKey(entry.file, hashKey)
  const cachedHash = cache.getHashValue(hashKey)
  const cachedCode = cachedHash?.hash === processHash ? cache.get<string>(entry.file) : undefined
  if (cachedCode === undefined) {
    return false
  }
  entry.output.code = cachedCode
  metrics.js.total++
  metrics.js.cacheHits++
  debug('js direct replay hit (planned clean): %s', entry.file)
  return true
}

export function processJsBundleEntry(options: ProcessJsBundleEntryOptions) {
  const {
    applyLinkedUpdates,
    bundle,
    cache,
    createHandlerOptions,
    debug,
    disableJsPrecheck,
    entry,
    getJsEntry,
    deferUniAppXStylePlaceholder,
    jsHandler,
    jsTaskFactories,
    linkedByEntry,
    metrics,
    onUpdate,
    outDir,
    processFiles,
    rememberProcessCacheKey,
    runtimeSignature,
    snapshot,
    shouldSkipAstTransform,
    slowJsAstWarnMs,
    timeTask,
    transformRuntime,
    transformRuntimeSignature,
    transformFilterSignature,
    uniAppX,
    useIncrementalMode,
  } = options
  const { file, output: originalSource, source: originalEntrySource } = entry

  metrics.js.total++
  const shouldTransformJs = !useIncrementalMode || processFiles.js.has(file)
  if (!shouldTransformJs) {
    // 增量轮次上游可能重写相同源码的原始 JS 产物，这里仍要走缓存回填以保持转译结果稳定。
    debug('js skip transform (clean), replay cache: %s', file)
  }

  if (originalSource.type === 'chunk') {
    const absoluteFile = path.resolve(outDir, file)
    const initialRawSource = originalEntrySource
    const linkedSet = useIncrementalMode ? new Set<string>() : undefined
    if (linkedByEntry && linkedSet) {
      linkedByEntry.set(file, linkedSet)
    }

    const linkedImpactSignature = useIncrementalMode
      ? createLinkedImpactSignature(
          file,
          snapshot.linkedImpactsByEntry,
          snapshot.sourceHashByFile,
        )
      : undefined
    const hashSalt = createJsHashSalt(
      `${transformRuntimeSignature}:transform-filter:${transformFilterSignature}`,
      linkedImpactSignature,
    )
    const hashKey = `${file}:js`
    const sourceHash = getSnapshotHash(snapshot.sourceHashByFile, file, initialRawSource)
    const processHash = `${sourceHash}:${hashSalt}`
    rememberProcessCacheKey(file, hashKey)

    if (useIncrementalMode && !shouldTransformJs) {
      const cachedHash = cache.getHashValue(hashKey)
      const cachedCode = cachedHash?.hash === processHash ? cache.get<string>(file) : undefined
      if (cachedCode !== undefined) {
        originalSource.code = cachedCode
        metrics.js.cacheHits++
        debug('js direct replay hit: %s', file)
        return
      }
    }

    jsTaskFactories.push(async () => {
      await timeTask('js', async () => {
        await processCachedTask<string>({
          cache,
          cacheKey: file,
          hashKey,
          hash: processHash,
          applyResult(source) {
            originalSource.code = source
          },
          onCacheHit() {
            metrics.js.cacheHits++
            debug('js cache hit: %s', file)
          },
          async transform() {
            const start = performance.now()
            const rawSource = originalSource.code
            if (!shouldTransformJs) {
              debug('js cache replay miss, fallback transform: %s', file)
            }
            if (shouldSkipAstTransform?.(originalSource)) {
              metrics.js.elapsed += measureElapsed(start)
              metrics.js.transformed++
              debug('js skip ast transform (filtered): %s', file)
              return {
                result: rawSource,
              }
            }
            const handlerOptions = createHandlerOptions(absoluteFile)
            if (!disableJsPrecheck && shouldSkipViteJsTransform(rawSource, handlerOptions)) {
              metrics.js.elapsed += measureElapsed(start)
              metrics.js.transformed++
              return {
                result: rawSource,
              }
            }

            const handlerStart = performance.now()
            const { code, linked } = await jsHandler(rawSource, transformRuntime, handlerOptions)
            const handlerElapsed = measureElapsed(handlerStart)
            metrics.js.elapsed += measureElapsed(start)
            metrics.js.transformed++
            if (handlerElapsed >= slowJsAstWarnMs) {
              logger.warn(
                'JS AST 转译耗时较长: %s 用时 %sms，源码约 %d bytes。若这是大型生成 TS/JS chunk，请配置 weapp-tailwindcss 的 transform.exclude 排除 generated/openapi 等目录。',
                file,
                handlerElapsed.toFixed(1),
                rawSource.length,
              )
            }
            onUpdate(file, rawSource, code)
            debug('js handle: %s', file)
            collectLinkedFileNames(linked, getJsEntry, linkedSet)
            applyLinkedUpdates(linked)
            return {
              result: code,
            }
          },
        })
      })
    })
  }
  else if (uniAppX && originalSource.type === 'asset') {
    const linkedSet = useIncrementalMode ? new Set<string>() : undefined
    if (linkedByEntry && linkedSet) {
      linkedByEntry.set(file, linkedSet)
    }

    const wrappedApplyLinkedUpdates = (linked?: Record<string, LinkedJsModuleResult>) => {
      collectLinkedFileNames(linked, getJsEntry, linkedSet)
      applyLinkedUpdates(linked)
    }

    const uniAppXJsHashKey = `${file}:js`
    rememberProcessCacheKey(file, uniAppXJsHashKey)
    const factory = createUniAppXAssetTask(
      file,
      originalSource,
      outDir,
      {
        cache,
        hashKey: uniAppXJsHashKey,
        hashSalt: createJsHashSalt(
          runtimeSignature,
          [
            UNI_APP_X_STYLE_PLACEHOLDER_VERSION,
            useIncrementalMode
              ? createLinkedImpactSignature(
                  file,
                  snapshot.linkedImpactsByEntry,
                  snapshot.sourceHashByFile,
                )
              : undefined,
          ].filter(Boolean).join(':'),
        ),
        createHandlerOptions,
        debug,
        getAssetSource: createUniAppXBundleAssetSourceGetter(bundle),
        injectStylePlaceholder: !deferUniAppXStylePlaceholder,
        jsHandler,
        onUpdate,
        runtimeSet: transformRuntime,
        applyLinkedResults: wrappedApplyLinkedUpdates,
        uniAppX,
      },
    )

    jsTaskFactories.push(async () => {
      await timeTask('js', async () => {
        const start = performance.now()
        if (!shouldTransformJs) {
          debug('js skip transform (clean, uni-app-x), replay cache: %s', file)
          await factory()
          metrics.js.elapsed += measureElapsed(start)
          metrics.js.transformed++
          return
        }
        const currentSource = originalEntrySource
        const absoluteFile = path.resolve(outDir, file)
        const precheckOptions = createHandlerOptions(absoluteFile, {
          uniAppX: resolveUniAppXJsTransformEnabled(uniAppX),
          babelParserOptions: {
            plugins: ['typescript'],
            sourceType: 'unambiguous',
          },
        })
        if (!disableJsPrecheck && shouldSkipViteJsTransform(currentSource, precheckOptions)) {
          metrics.js.elapsed += measureElapsed(start)
          metrics.js.transformed++
          return
        }
        await factory()
        metrics.js.elapsed += measureElapsed(start)
        metrics.js.transformed++
      })
    })
  }
}
