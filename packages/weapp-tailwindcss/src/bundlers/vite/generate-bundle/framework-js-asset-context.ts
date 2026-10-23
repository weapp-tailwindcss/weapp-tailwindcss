import type { OutputAsset, OutputBundle } from 'rollup'
import type { ViteFrameworkJsAssetContext } from '../shared/framework-asset-strategy'
import type { CreateJsHandlerOptions, InternalUserDefinedOptions, LinkedJsModuleResult } from '@/types'
import { processCachedTask } from '../../shared/cache'
import { toAbsoluteOutputPath } from '../../shared/module-graph'
import { shouldSkipViteJsTransform } from '../js-precheck'

interface FrameworkJsAssetContextOptions {
  asset: OutputAsset
  bundle: OutputBundle
  file: string
  source: string
  outDir: string
  cache: InternalUserDefinedOptions['cache']
  hashKey: string
  hashSalt: string
  createHandlerOptions: (file: string, extra?: CreateJsHandlerOptions) => CreateJsHandlerOptions
  debug: (format: string, ...args: unknown[]) => void
  disableJsPrecheck: boolean
  jsHandler: InternalUserDefinedOptions['jsHandler']
  onUpdate: InternalUserDefinedOptions['onUpdate']
  runtimeSet: Set<string>
  shouldTransform: boolean
  applyLinkedResults: (linked?: Record<string, LinkedJsModuleResult>) => void
}

/** 将缓存和运行时类集合绑定到当前资产；框架只提交转换操作与结果。 */
export function createFrameworkJsAssetContext(options: FrameworkJsAssetContextOptions): ViteFrameworkJsAssetContext {
  const absoluteFile = toAbsoluteOutputPath(options.file, options.outDir)
  return {
    bundle: options.bundle,
    file: options.file,
    shouldTransform: options.shouldTransform,
    shouldSkipTransform: extra => !options.disableJsPrecheck
      && shouldSkipViteJsTransform(options.source, options.createHandlerOptions(absoluteFile, extra)),
    async transformJs(source, extra) {
      return options.jsHandler(source, options.runtimeSet, options.createHandlerOptions(absoluteFile, extra))
    },
    async runCachedTransform(task) {
      const rawSource = options.asset.source.toString()
      const hashSalt = `${options.hashSalt}:${task.hashSalt}`
      await processCachedTask<string>({
        cache: options.cache,
        cacheKey: options.file,
        hashKey: options.hashKey,
        rawSource: `${rawSource}\n/*${hashSalt}*/`,
        applyResult(source) {
          options.asset.source = source
        },
        onCacheHit() {
          options.debug('js cache hit: %s', options.file)
        },
        async transform() {
          const currentSource = options.asset.source.toString()
          const { code, linked } = await task.transform(currentSource)
          options.onUpdate(options.file, currentSource, code)
          options.debug('js handle: %s', options.file)
          options.applyLinkedResults(linked)
          return { result: code }
        },
      })
    },
  }
}
