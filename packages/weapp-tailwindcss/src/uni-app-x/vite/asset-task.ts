import type { OutputAsset } from 'rollup'
import type { ICreateCacheReturnType } from '@/cache'
import type {
  CreateJsHandlerOptions,
  InternalUserDefinedOptions,
  JsHandler,
  LinkedJsModuleResult,
} from '@/types'
import { processCachedTask } from '@/bundlers/shared/cache'
import { toAbsoluteOutputPath } from '@/bundlers/shared/module-graph'
import { isUniAppXEnabled } from '../options'
import { injectUniAppXStylePlaceholder } from '../style-asset'

type ApplyLinkedResults = (linked: Record<string, LinkedJsModuleResult> | undefined) => void

export interface CreateUniAppXAssetTaskOptions {
  cache: ICreateCacheReturnType
  hashKey?: string
  hashSalt?: string
  createHandlerOptions: (absoluteFilename: string, extra?: CreateJsHandlerOptions) => CreateJsHandlerOptions
  debug: (format: string, ...args: unknown[]) => void
  jsHandler: JsHandler
  onUpdate: (filename: string, oldVal: string, newVal: string) => void
  runtimeSet: Set<string>
  applyLinkedResults: ApplyLinkedResults
  uniAppX?: InternalUserDefinedOptions['uniAppX']
  getAssetSource?: (file: string) => string | undefined
  getCssSources?: () => Iterable<string | undefined>
  injectStylePlaceholder?: boolean
}

function resolveUniAppXJsTransformEnabled(uniAppX: InternalUserDefinedOptions['uniAppX'] | undefined) {
  return uniAppX === undefined ? true : isUniAppXEnabled(uniAppX)
}

export function createUniAppXAssetTask(
  file: string,
  originalSource: OutputAsset,
  outDir: string,
  options: CreateUniAppXAssetTaskOptions,
) {
  return async () => {
    const {
      cache,
      hashKey,
      createHandlerOptions,
      debug,
      getAssetSource,
      getCssSources,
      injectStylePlaceholder = true,
      jsHandler,
      onUpdate,
      runtimeSet,
      applyLinkedResults,
    } = options
    const absoluteFile = toAbsoluteOutputPath(file, outDir)
    const rawSource = originalSource.source.toString()
    const rawHashSource = options.hashSalt
      ? `${rawSource}\n/*${options.hashSalt}*/`
      : rawSource
    await processCachedTask<string>({
      cache,
      cacheKey: file,
      hashKey,
      rawSource: rawHashSource,
      applyResult(source) {
        originalSource.source = source
      },
      onCacheHit() {
        debug('js cache hit: %s', file)
      },
      async transform() {
        const currentSource = originalSource.source.toString()
        const { code, linked } = await jsHandler(currentSource, runtimeSet, createHandlerOptions(absoluteFile, {
          uniAppX: resolveUniAppXJsTransformEnabled(options.uniAppX),
          babelParserOptions: {
            plugins: [
              'typescript',
            ],
            sourceType: 'unambiguous',
          },
        }))
        const nextCode = injectStylePlaceholder
          ? injectUniAppXStylePlaceholder(file, code, getAssetSource, getCssSources?.())
          : code
        onUpdate(file, currentSource, nextCode)
        debug('js handle: %s', file)
        applyLinkedResults(linked)
        return {
          result: nextCode,
        }
      },
    })
  }
}
