import { shouldSkipJsTransform } from '@/js/precheck'
import { processCachedTask } from '../../../shared/cache'
import { toAbsoluteOutputPath } from '../../../shared/module-graph'
import { getCacheKey } from '../shared'
import {
  stringifyOptionalWebpackSourceValue,
} from './pipeline-helpers'

export * from './pipeline-helpers'

export async function enqueueWebpackHtmlAndJsTasks(context: any) {
  const { ConcatSource, applyWebpackLinkedJsResults, assetHashByChunk, compilation, compilerOptions, debug, defaultTemplateHandlerOptions, enqueueTask, groupedEntries, isWebGeneratorTarget, jsAssets, moduleGraphOptions, outputDir, rememberProcessCacheKey, rememberTransformedRuntimeCandidates, runtimeState, transformRuntimeSet, updateAssetIfChanged, watchMode } = context
  const transformRuntimeSetHash = isWebGeneratorTarget ? '' : compilerOptions.cache.computeHash(JSON.stringify([...transformRuntimeSet].sort()))
  const htmlTaskFactories: Array<() => Promise<void>> = []
  if (!isWebGeneratorTarget && Array.isArray(groupedEntries.html)) {
    for (const element of groupedEntries.html) {
      const [file, originalSource] = element
      let rawSource: string | undefined
      const readRawSource = () => {
        rawSource ??= originalSource.source().toString()
        return rawSource
      }

      const cacheKey = file
      const hashKey = `${file}:asset`
      rememberProcessCacheKey(cacheKey, hashKey)
      const chunkHash = assetHashByChunk.get(file)
      await enqueueTask(async () => {
        await processCachedTask({
          cache: compilerOptions.cache,
          cacheKey,
          hashKey,
          rawSource: chunkHash === undefined ? readRawSource() : undefined,
          hash: `${chunkHash ?? compilerOptions.cache.computeHash(readRawSource())}:${transformRuntimeSetHash}`,
          applyResult(source, { cacheHit }) {
            updateAssetIfChanged(file, source, {
              compare: !cacheHit,
              notifyUpdate: !cacheHit,
            })
          },
          onCacheHit() {
            debug('html cache hit: %s', file)
          },
          transform: async () => {
            const wxml = await compilerOptions.templateHandler(readRawSource(), defaultTemplateHandlerOptions)
            const source = new ConcatSource(wxml)
            debug('html handle: %s', file)

            return {
              result: source,
            }
          },
        })
      }, htmlTaskFactories, 'tasks.html')
    }
  }

  const jsTaskFactories: Array<() => Promise<void>> = []
  const enqueueJsTask = async (factory: () => Promise<void>) => {
    await enqueueTask(factory, jsTaskFactories, 'tasks.js')
  }

  if (!isWebGeneratorTarget && Array.isArray(groupedEntries.js)) {
    for (const [file] of groupedEntries.js) {
      const cacheKey = getCacheKey(file)
      const asset = compilation.getAsset(file)
      if (!asset) {
        continue
      }
      const hashKey = `${file}:asset`
      rememberProcessCacheKey(cacheKey, hashKey)
      const absoluteFile = toAbsoluteOutputPath(file, outputDir)
      const initialSource = asset.source.source()
      const initialRawSource = typeof initialSource === 'string' ? initialSource : initialSource.toString()
      const chunkHash = assetHashByChunk.get(file)
      // Webpack chunk 之间的字面量 require 是 runtime bootstrap 边，chunk 本身会在当前产物图中独立转译。
      // 仅非 chunk 的原生 JS/WXS 继续使用输出模块图处理跨文件源码引用。
      const outputModuleGraphOptions = chunkHash === undefined ? moduleGraphOptions : undefined
      await enqueueJsTask(async () => {
        await processCachedTask({
          cache: compilerOptions.cache,
          cacheKey,
          hashKey,
          rawSource: chunkHash === undefined ? initialRawSource : undefined,
          hash: `${chunkHash ?? compilerOptions.cache.computeHash(initialRawSource)}:${transformRuntimeSetHash}`,
          applyResult(source, { cacheHit }) {
            const updated = updateAssetIfChanged(file, source, {
              compare: !cacheHit,
              notifyUpdate: !cacheHit,
            })
            if (updated) {
              rememberTransformedRuntimeCandidates(source)
            }
          },
          onCacheHit() {
            debug('js cache hit: %s', file)
          },
          transform: async () => {
            const currentAsset = compilation.getAsset(file)
            const currentSourceValue = currentAsset?.source.source()
            const currentSource = stringifyOptionalWebpackSourceValue(currentSourceValue)
            const handlerOptions = {
              tailwindcssMajorVersion: runtimeState.tailwindRuntime.majorVersion,
              generateMap: false,
              experimentalJsFastPath: compilerOptions.experimentalJsFastPath ?? (watchMode ? 'oxc' : false),
              filename: absoluteFile,
              moduleGraph: outputModuleGraphOptions,
              babelParserOptions: {
                sourceFilename: absoluteFile,
              },
            }
            if (shouldSkipJsTransform(currentSource, {
              ...handlerOptions,
              classNameSet: transformRuntimeSet,
            })) {
              return { result: new ConcatSource(currentSource) }
            }
            const { code, linked } = await compilerOptions.jsHandler(currentSource, transformRuntimeSet, handlerOptions)
            const source = new ConcatSource(code)
            debug('js handle: %s', file)
            applyWebpackLinkedJsResults({
              ConcatSource,
              compilation,
              compilerOptions,
              debug,
              jsAssets,
              linked,
            })
            return {
              result: source,
            }
          },
        })
      })
    }
  }
  return {
    htmlTaskFactories,
    jsTaskFactories,
  }
}
