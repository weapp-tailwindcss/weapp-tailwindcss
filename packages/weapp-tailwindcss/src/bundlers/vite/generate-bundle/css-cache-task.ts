import type { OutputAsset } from 'rollup'
import type { RememberedCssSource } from './types'
import type { ICreateCacheReturnType } from '@/cache'
import { processCachedTask } from '../../shared/cache'
import { discardedViteCssSource } from '../css-memory/source-lifecycle'
import { hasTailwindGenerationSource } from './sfc-style-source'
import { rememberLastCssResult } from './vite-css-cache'

export interface ApplyViteCssCacheResultOptions {
  applyCssResult: (source: string) => void
  recordCssResult?: ((source: string) => void) | undefined
  cssRuntimeAffectingHash: string
  generatorRawSource: string
  generatorSourceFile: string
  generatorSourceKind?: RememberedCssSource['kind']
  lastCssResultByFile: Map<string, string>
  lastCssSourceHashByFile: Map<string, string>
  markCssAssetProcessed?: ((asset: OutputAsset, file?: string) => void) | undefined
  originalSource: OutputAsset
  outputFile: string
  rememberedCssRuntimeSignature: string
  rememberedSourcesCount: number
  rememberedSourceInputs?: readonly Pick<RememberedCssSource, 'rawSource' | 'sourceFile' | 'delivery' | 'kind'>[] | undefined
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
  // 产物缓存不授予生成来源所有权，普通 CSS 不能在 watch 中覆盖本轮框架贡献。
  const sourceKind = options.generatorSourceKind
    ?? (hasTailwindGenerationSource(options.generatorRawSource) ? 'generation' : undefined)
  if (sourceKind && options.rememberedSourceInputs && options.rememberedSourceInputs.length > 1) {
    // 合并产物只共享输出，作者输入仍按各自模块身份登记，不能写回首个样式块。
    for (const input of options.rememberedSourceInputs) {
      if (input.kind !== 'output-import-shell' && !hasTailwindGenerationSource(input.rawSource)) {
        continue
      }
      options.rememberCssSource?.({
        ...input,
        kind: input.kind ?? sourceKind,
        outputFile: options.vitePipelineCssInjectionOutputFile,
      }, options.rememberedCssRuntimeSignature)
    }
  }
  else if (options.rememberedSourcesCount <= 1 && sourceKind) {
    options.rememberCssSource?.({
      kind: sourceKind,
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
      const createTask = () => {
        const task = options.transform()
        const sharedCacheKey = options.sharedCacheKey
        if (sharedCacheKey) {
          options.sharedResultCache.set(sharedCacheKey, task)
          void task.catch(() => {
            if (options.sharedResultCache.get(sharedCacheKey) === task) {
              options.sharedResultCache.delete(sharedCacheKey)
            }
          })
        }
        return task
      }
      let task: Promise<string>
      if (options.sharedCacheKey) {
        const sharedTask = options.sharedResultCache.get(options.sharedCacheKey)
        if (sharedTask) {
          options.onSharedCacheHit()
          // 被删除的来源不能取消其他独立消费者，后者用自身凭据重新生成。
          const sharedCss = await sharedTask.catch((error) => {
            if (error !== discardedViteCssSource) {
              throw error
            }
            return createTask()
          })
          options.onSharedResult(sharedCss)
          task = Promise.resolve(sharedCss)
        }
        else {
          task = createTask()
        }
      }
      else {
        task = createTask()
      }
      const css = await task
      options.onTransformResult(css)
      return { result: css }
    },
  })
}
