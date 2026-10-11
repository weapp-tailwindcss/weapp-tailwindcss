import type { ProcessOptions, Processor } from 'postcss'
import type { FeatureSignal } from './content-probe'
import type { StyleProcessingPipeline } from './pipeline'
import type { IStyleHandlerOptions } from './types'
import { LRUCache } from 'lru-cache'
import postcss from 'postcss'
import { signalToCacheKey } from './content-probe'
import { fingerprintOptions, fingerprintStyleOptions } from './fingerprint'
import { createStylePipeline } from './pipeline'

function createProcessOptions(options: IStyleHandlerOptions): ProcessOptions {
  return {
    from: undefined,
    ...(options.postcssOptions?.options ?? {}),
  }
}

function getSimpleProcessOptionsCacheKey(options: Record<string, unknown>) {
  const parts: string[] = ['simple']

  for (const key of Object.keys(options).sort()) {
    const value = options[key]
    switch (typeof value) {
      case 'string':
        parts.push(`${key}:str:${value}`)
        break
      case 'number':
        parts.push(`${key}:num:${value}`)
        break
      case 'boolean':
        parts.push(`${key}:bool:${value ? '1' : '0'}`)
        break
      case 'undefined':
        parts.push(`${key}:undefined`)
        break
      case 'object':
        if (value === null) {
          parts.push(`${key}:null`)
          break
        }
        return undefined
      default:
        return undefined
    }
  }

  return parts.join('|')
}

export class StyleProcessorCache {
  private readonly pipelineCacheByKey = new LRUCache<string, StyleProcessingPipeline>({ max: 64 })
  private readonly processOptionsCache = new WeakMap<IStyleHandlerOptions, { value: ProcessOptions, cacheKey?: string | undefined }>()
  private readonly processorCacheByKey = new LRUCache<string, Processor>({ max: 64 })

  private createProcessorCacheKey(options: IStyleHandlerOptions) {
    const from = options.postcssOptions?.options?.from
    if (from == null) {
      return fingerprintStyleOptions(options)
    }

    return fingerprintStyleOptions({
      ...options,
      postcssOptions: {
        ...(options.postcssOptions ?? {}),
        options: {
          ...(options.postcssOptions?.options ?? {}),
          from: undefined,
        },
      },
    })
  }

  /**
   * 构建包含信号的复合缓存键
   */
  private createCompositeCacheKey(optionsFingerprint: string, signal?: FeatureSignal): string {
    if (!signal) {
      return optionsFingerprint
    }
    return `${optionsFingerprint}|${signalToCacheKey(signal)}`
  }

  getPipeline(options: IStyleHandlerOptions, signal?: FeatureSignal) {
    const optionsKey = this.createProcessorCacheKey(options)
    const compositeKey = this.createCompositeCacheKey(optionsKey, signal)
    return this.getPipelineByKey(compositeKey, options, signal)
  }

  private getPipelineByKey(compositeKey: string, options: IStyleHandlerOptions, signal?: FeatureSignal) {
    let pipeline = this.pipelineCacheByKey.get(compositeKey)
    if (!pipeline) {
      pipeline = createStylePipeline(options, signal)
      this.pipelineCacheByKey.set(compositeKey, pipeline)
    }
    return pipeline
  }

  getProcessOptions(options: IStyleHandlerOptions): ProcessOptions {
    const source = options.postcssOptions?.options
    const cacheKey = source
      ? getSimpleProcessOptionsCacheKey(source as Record<string, unknown>) ?? fingerprintOptions(source)
      : undefined
    const cached = this.processOptionsCache.get(options)

    if (!cached || cached.cacheKey !== cacheKey) {
      const created = createProcessOptions(options)
      this.processOptionsCache.set(options, { value: created, cacheKey })
      return { ...created }
    }

    return { ...cached.value }
  }

  getProcessor(options: IStyleHandlerOptions, signal?: FeatureSignal) {
    const optionsKey = this.createProcessorCacheKey(options)
    const compositeKey = this.createCompositeCacheKey(optionsKey, signal)

    let processor = this.processorCacheByKey.get(compositeKey)
    if (!processor) {
      // 同次处理的选项快照未变，直接传递签名，避免 miss 路径重复遍历嵌套配置。
      const pipeline = this.getPipelineByKey(compositeKey, options, signal)
      processor = postcss(pipeline.plugins)
      this.processorCacheByKey.set(compositeKey, processor)
    }
    return processor
  }
}
