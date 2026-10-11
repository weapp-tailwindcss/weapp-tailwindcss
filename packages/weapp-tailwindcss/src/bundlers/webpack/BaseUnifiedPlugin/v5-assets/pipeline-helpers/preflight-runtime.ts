import type { TailwindV4CssSource } from '../../../../../generation/source-resolver/types'
import type { SourceCandidateStore } from '../../../../../project-sources/candidates'
import type { SetupWebpackV5ProcessAssetsHookOptions } from '../helpers'
import type { resolveStyleOptionsFromContext } from '@/context/style-options'
import type { TailwindcssRuntimeLike } from '@/types'
import { hasMiniProgramPreflightSelector } from '@weapp-tailwindcss/postcss/transform'
import { getDefaultCssPreflight } from '@/defaults'
import { collectGeneratedCssRuntimeCandidates } from './generated-css'
import { isRuntimeTransformCandidate } from './runtime-candidates'

export { isRuntimeTransformCandidate } from './runtime-candidates'

export interface WebpackCssHandlerOptions {
  isMainChunk: boolean
  postcssOptions: { options: { from: string } }
  majorVersion?: 4 | undefined
  sourceOptions?: {
    cssSources?: TailwindV4CssSource[] | undefined
    outputRoot?: string | undefined
    sourceCss?: string | undefined
    sourceFile?: string | undefined
  } | undefined
}

export const WEBPACK_CSS_HANDLER_OPTIONS_CACHE_MAX = 128

export function resolveConfiguredWebpackCssPreflight(
  compilerOptions: SetupWebpackV5ProcessAssetsHookOptions['options'],
  styleOptions: ReturnType<typeof resolveStyleOptionsFromContext>,
) {
  return styleOptions.cssPreflight ?? compilerOptions.cssPreflight ?? getDefaultCssPreflight()
}

export function resolveExistingWebpackCssPreflight(
  compilerOptions: SetupWebpackV5ProcessAssetsHookOptions['options'],
  styleOptions: ReturnType<typeof resolveStyleOptionsFromContext>,
  source: string,
) {
  return hasMiniProgramPreflightSelector(source)
    ? resolveConfiguredWebpackCssPreflight(compilerOptions, styleOptions)
    : undefined
}

export { dedupeMiniProgramPreflightSelectorRules, ensureWebpackMiniProgramTwContentInit, hasMiniProgramPreflightSelector, removeMiniProgramPreflightSelectorRule, removeTailwindV4StandaloneHostPreflightRule } from '@weapp-tailwindcss/postcss/transform'

export interface WebpackSourceCandidateCache {
  getSourceCandidatesForEntries: SourceCandidateStore['valuesForEntries']
  signatureHash: string
  tokenSources: ReturnType<SourceCandidateStore['sourcesForEntries']>
}

export function collectRuntimeTokenSignatureParts(source: string) {
  return source.match(/[\w-]+_[A-Z][\w-]*/gi) ?? []
}

export function hasMissingRuntimeCandidates(
  classSet: ReadonlySet<string> | undefined,
  candidates: ReadonlySet<string> | undefined,
) {
  if (!classSet || !candidates?.size) {
    return false
  }
  for (const candidate of candidates) {
    if (isRuntimeTransformCandidate(candidate) && !classSet.has(candidate)) {
      return true
    }
  }
  return false
}

export function hasStaleRuntimeCandidates(
  classSet: ReadonlySet<string> | undefined,
  candidates: ReadonlySet<string> | undefined,
) {
  if (!classSet || !candidates) {
    return false
  }
  for (const candidate of classSet) {
    if (isRuntimeTransformCandidate(candidate) && !candidates.has(candidate)) {
      return true
    }
  }
  return false
}

export function resolveGeneratedCssRuntimeCandidates(
  source: string,
  fallbackClassSet?: ReadonlySet<string> | undefined,
) {
  const classSet = collectGeneratedCssRuntimeCandidates(source)
  if (classSet.size > 0 || fallbackClassSet === undefined) {
    return classSet
  }
  return fallbackClassSet
}

export function getRuntimeClassSetSync(tailwindRuntime: TailwindcssRuntimeLike) {
  if (typeof tailwindRuntime.getClassSetSync !== 'function') {
    return new Set<string>()
  }
  try {
    return new Set(tailwindRuntime.getClassSetSync() ?? [])
  }
  catch {
    return new Set<string>()
  }
}

export function toMb(bytes: number) {
  return Math.round(bytes / 1024 / 1024)
}

export function pruneMapToMaxSize<Key, Value>(map: Map<Key, Value>, maxSize: number) {
  while (map.size > maxSize) {
    const oldestKey = map.keys().next().value
    if (oldestKey === undefined) {
      break
    }
    map.delete(oldestKey)
  }
}

export { stripTrailingLineWhitespace } from '@weapp-tailwindcss/postcss/transform'

export function pruneWebpackCssHandlerOptionCaches(
  cssHandlerOptionsCache: Map<string, WebpackCssHandlerOptions>,
  cssUserHandlerOptionsCache: Map<string, WebpackCssHandlerOptions>,
  activeCssFiles: Set<string>,
) {
  const activeSuffixes = [...activeCssFiles].map(file => `:${file}`)
  for (const key of cssHandlerOptionsCache.keys()) {
    if (!activeSuffixes.some(suffix => key.endsWith(suffix))) {
      cssHandlerOptionsCache.delete(key)
    }
  }
  for (const key of cssUserHandlerOptionsCache.keys()) {
    if (!activeSuffixes.some(suffix => key.endsWith(suffix))) {
      cssUserHandlerOptionsCache.delete(key)
    }
  }
  pruneMapToMaxSize(cssHandlerOptionsCache, WEBPACK_CSS_HANDLER_OPTIONS_CACHE_MAX)
  pruneMapToMaxSize(cssUserHandlerOptionsCache, WEBPACK_CSS_HANDLER_OPTIONS_CACHE_MAX)
}
