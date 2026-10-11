import type { InternalUserDefinedOptions, IStyleHandlerOptions } from '@/types'
import path from 'node:path'
import { normalizeStyleHandlerMajorVersion } from '@/context/style-options'
import { stripRequestQuery } from '../../generation/style-requests'
import { normalizeOutputPathKey } from '../shared/module-graph'

type CssHandlerOptions = IStyleHandlerOptions & {
  postcssOptions: {
    options: {
      from: string
    }
  }
  majorVersion?: 4 | undefined
  sourceOptions?: {
    outputRoot?: string | undefined
    requestFile?: string | undefined
  } | undefined
}

interface CssHandlerOptionsCacheOptions {
  getAppType: () => InternalUserDefinedOptions['appType'] | undefined
  mainCssChunkMatcher: InternalUserDefinedOptions['mainCssChunkMatcher']
  getMajorVersion: () => number | undefined
  getOutputRoot?: (() => string | undefined) | undefined
  getExtraOptions?: ((file: string) => Partial<IStyleHandlerOptions>) | undefined
  getDynamicCssOptions?: (() => Partial<IStyleHandlerOptions>) | undefined
}

export interface CssHandlerOptionsCache {
  getCssHandlerOptions: (file: string) => CssHandlerOptions
  getCssUserHandlerOptions: (file: string) => CssHandlerOptions
}

export function resolveViteCssHandlerExtraOptions(file: string) {
  const normalized = normalizeOutputPathKey(file.replace(/[?#].*$/, ''))
  return normalized.includes('/')
    ? { isMainChunk: false }
    : {}
}

export function createCssHandlerOptionsCache(options: CssHandlerOptionsCacheOptions): CssHandlerOptionsCache {
  const cssHandlerOptionsCache = new Map<string, CssHandlerOptions>()
  const cssUserHandlerOptionsCache = new Map<string, CssHandlerOptions>()

  const getCssHandlerOptions = (file: string) => {
    const majorVersion = options.getMajorVersion()
    const appType = options.getAppType()
    const isMainChunk = options.mainCssChunkMatcher(file, appType)
    const outputRoot = options.getOutputRoot?.()
    const sourceFile = stripRequestQuery(file)
    const from = path.isAbsolute(sourceFile)
      ? sourceFile
      : outputRoot
        ? path.resolve(outputRoot, sourceFile)
        : sourceFile
    const extraOptions = options.getExtraOptions?.(file) ?? {}
    const dynamicCssOptions = options.getDynamicCssOptions?.() ?? {}
    const cacheKey = `${majorVersion ?? 'unknown'}:${appType ?? 'unknown'}:${isMainChunk ? '1' : '0'}:${outputRoot ?? ''}:${file}:${JSON.stringify(extraOptions)}:${JSON.stringify(dynamicCssOptions)}`
    const cached = cssHandlerOptionsCache.get(cacheKey)
    if (cached) {
      return cached
    }

    const created = {
      isMainChunk,
      ...extraOptions,
      ...dynamicCssOptions,
      postcssOptions: {
        options: {
          from,
        },
      },
      majorVersion: normalizeStyleHandlerMajorVersion(majorVersion),
      sourceOptions: {
        outputRoot,
        ...(sourceFile === file ? {} : { requestFile: file }),
      },
    }
    cssHandlerOptionsCache.set(cacheKey, created)
    return created
  }

  const getCssUserHandlerOptions = (file: string) => {
    const majorVersion = options.getMajorVersion()
    const outputRoot = options.getOutputRoot?.()
    const cacheKey = `${majorVersion ?? 'unknown'}:${outputRoot ?? ''}:${file}`
    const cached = cssUserHandlerOptionsCache.get(cacheKey)
    if (cached) {
      return cached
    }

    const created = {
      ...getCssHandlerOptions(file),
      isMainChunk: false,
    }
    cssUserHandlerOptionsCache.set(cacheKey, created)
    return created
  }

  return {
    getCssHandlerOptions,
    getCssUserHandlerOptions,
  }
}
