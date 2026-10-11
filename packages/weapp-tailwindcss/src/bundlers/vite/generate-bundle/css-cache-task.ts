import type { OutputAsset } from 'rollup'
import type { RememberedCssSource } from './types'
import type { ICreateCacheReturnType } from '@/cache'
import { processCachedTask } from '../../shared/cache'
import { rememberLastCssResult } from './vite-css-cache'

export interface ApplyViteCssCacheResultOptions {
  applyCssResult: (source: string) => void
  recordCssResult?: ((source: string) => void) | undefined
  cssRuntimeAffectingHash: string
  generatorRawSource: string
  generatorSourceFile: string
  lastCssResultByFile: Map<string, string>
  lastCssSourceHashByFile: Map<string, string>
  markCssAssetProcessed?: ((asset: OutputAsset, file?: string) => void) | undefined
  originalSource: OutputAsset
  outputFile: string
  rememberedCssRuntimeSignature: string
  rememberedSourcesCount: number
  rememberCssSource?: ((entry: RememberedCssSource, cssRuntimeSignature?: string) => void) | undefined
  vitePipelineCssInjectionOutputFile: string
}

export function applyViteCssCacheResult(
  options: ApplyViteCssCacheResultOptions,
  source: string,
) {
  options.applyCssResult(source)
  options.recordCssResult?.(source)
  rememberLastCssResult(
    options.lastCssResultByFile,
    options.lastCssSourceHashByFile,
    options.outputFile,
    source,
    options.cssRuntimeAffectingHash,
  )
  options.markCssAssetProcessed?.(options.originalSource, options.outputFile)
  if (options.rememberedSourcesCount <= 1) {
    options.rememberCssSource?.({
      outputFile: options.vitePipelineCssInjectionOutputFile,
      rawSource: options.generatorRawSource,
      sourceFile: options.generatorSourceFile,
    }, options.rememberedCssRuntimeSignature)
  }
}

export interface ProcessViteCssCacheTaskOptions {
  applyResult: (source: string) => void | Promise<void>
  cache: ICreateCacheReturnType
  cacheKey: string
  hashKey: string
  onCacheHit: () => void
  onSharedCacheHit: () => void
  onSharedResult: (source: string) => void
  onTransformResult: (source: string) => void
  sharedCacheKey?: string | undefined
  sharedResultCache: Map<string, Promise<string>>
  taskHash: string
  transform: () => Promise<string>
}

export function processViteCssCacheTask(
  options: ProcessViteCssCacheTaskOptions,
) {
  return processCachedTask({
    applyResult: options.applyResult,
    cache: options.cache,
    cacheKey: options.cacheKey,
    hash: options.taskHash,
    hashKey: options.hashKey,
    onCacheHit: options.onCacheHit,
    async transform() {
      let task: Promise<string>
      if (options.sharedCacheKey) {
        const sharedTask = options.sharedResultCache.get(options.sharedCacheKey)
        if (sharedTask) {
          options.onSharedCacheHit()
          const sharedCss = await sharedTask
          options.onSharedResult(sharedCss)
          task = Promise.resolve(sharedCss)
        }
        else {
          task = options.transform()
          options.sharedResultCache.set(options.sharedCacheKey, task)
        }
      }
      else {
        task = options.transform()
      }
      const css = await task
      options.onTransformResult(css)
      return { result: css }
    },
  })
}
