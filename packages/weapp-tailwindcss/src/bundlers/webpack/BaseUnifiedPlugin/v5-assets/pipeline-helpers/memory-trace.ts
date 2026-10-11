import type { SetupWebpackV5ProcessAssetsHookOptions } from '../helpers'
import type { WebpackSourceCandidateScanMemoryStats } from '../source-candidate-cache'
import type { WebpackCssHandlerOptions } from './preflight-runtime'
import process from 'node:process'
import { postcss } from '@weapp-tailwindcss/postcss/transform'
import { resolveStyleOptionsFromContext } from '@/context/style-options'
import { getTailwindV4IncrementalGenerateCacheStats } from '@/tailwindcss/v4-engine'
import { hasTailwindApplyDirective, hasTailwindRootDirectives, parseImportRequest } from '../../../../../generation/directives'
import { hasMiniProgramTailwindV4PreflightReset } from '../../../../../generation/generation-helpers'
import { hasTailwindSourceDirectives } from '../../../../../generation/index'
import { removeMiniProgramInteractiveSelectors } from '../../../../../generation/user-css'
import { finalizeMiniProgramCss, stripMiniProgramCssSpecificityPlaceholders } from '../../../../shared/css-cleanup'
import { removeTailwindV4StandaloneHostPreflightRule, resolveConfiguredWebpackCssPreflight, toMb, WEBPACK_CSS_HANDLER_OPTIONS_CACHE_MAX } from './preflight-runtime'

export function resolveWebpackMemoryDebugStats(context: {
  activeAssetFiles: number
  activeCssFiles: number
  activeProcessCacheKeys: Set<string>
  activeProcessHashKeys: Set<string | number>
  cache: SetupWebpackV5ProcessAssetsHookOptions['options']['cache']
  cssHandlerOptionsCache: Map<string, WebpackCssHandlerOptions>
  cssUserHandlerOptionsCache: Map<string, WebpackCssHandlerOptions>
  phase: string
  sourceCandidateScan: WebpackSourceCandidateScanMemoryStats
}) {
  if (process.env['WEAPP_TW_HMR_MEMORY_DEBUG'] !== '1') {
    return undefined
  }

  const memory = process.memoryUsage()
  const processCacheInstanceSize = context.cache.instance.size
  const processCacheHashMapSize = context.cache.hashMap.size
  return {
    phase: context.phase,
    process: {
      rssMb: toMb(memory.rss),
      heapTotalMb: toMb(memory.heapTotal),
      heapUsedMb: toMb(memory.heapUsed),
      externalMb: toMb(memory.external),
      arrayBuffersMb: toMb(memory.arrayBuffers),
    },
    assets: {
      active: context.activeAssetFiles,
      activeCss: context.activeCssFiles,
    },
    processCache: {
      instance: processCacheInstanceSize,
      hashMap: processCacheHashMapSize,
      activeCacheKeys: context.activeProcessCacheKeys.size,
      activeHashKeys: context.activeProcessHashKeys.size,
      staleCacheKeys: Math.max(0, processCacheInstanceSize - context.activeProcessCacheKeys.size),
      staleHashKeys: Math.max(0, processCacheHashMapSize - context.activeProcessHashKeys.size),
      pruned: true,
      pruneSkipped: false,
    },
    webpackCss: {
      handlerOptions: context.cssHandlerOptionsCache.size,
      userHandlerOptions: context.cssUserHandlerOptionsCache.size,
      maxHandlerOptions: WEBPACK_CSS_HANDLER_OPTIONS_CACHE_MAX,
    },
    sourceCandidateScan: context.sourceCandidateScan,
    tailwind: {
      v4: getTailwindV4IncrementalGenerateCacheStats(),
    },
  }
}

export function shouldInjectWebpackCssTracePreflight(
  _appType: SetupWebpackV5ProcessAssetsHookOptions['appType'],
  cssHandlerOptions: Pick<WebpackCssHandlerOptions, 'isMainChunk' | 'sourceOptions'>,
) {
  if (includesTailwindPreflightImport(cssHandlerOptions.sourceOptions?.sourceCss)) {
    return true
  }
  return cssHandlerOptions.isMainChunk !== false
}

function includesTailwindPreflightImport(source: string | undefined) {
  if (!source) {
    return false
  }
  try {
    let includesPreflight = false
    postcss.parse(source).walkAtRules((rule) => {
      if (rule.name === 'tailwind') {
        includesPreflight ||= rule.params.trim() === 'base'
        return
      }
      if (rule.name !== 'import') {
        return
      }
      const request = parseImportRequest(rule.params)?.replaceAll('\\', '/')
      includesPreflight ||= request === 'tailwindcss'
        || request === 'tailwindcss/preflight.css'
        || request?.endsWith('/tailwindcss/index.css') === true
        || request?.endsWith('/tailwindcss/preflight.css') === true
    })
    return includesPreflight
  }
  catch {
    return false
  }
}

export function finalizeMiniProgramUserCssAssetSource(
  source: string,
  compilerOptions: SetupWebpackV5ProcessAssetsHookOptions['options'],
  isWebGeneratorTarget: boolean,
  options: { cssPreflight?: boolean | undefined } = {},
) {
  const styleOptions = resolveStyleOptionsFromContext(compilerOptions)
  if (isWebGeneratorTarget) {
    return source
  }
  const finalized = finalizeMiniProgramCss(removeMiniProgramInteractiveSelectors(source, {
    active: styleOptions.cssRemoveActivePseudoClass ?? true,
    hover: styleOptions.cssRemoveHoverPseudoClass ?? true,
  }), {
    cssPreflight: options.cssPreflight === false
      ? false
      : !hasMiniProgramTailwindV4PreflightReset(source)
          ? resolveConfiguredWebpackCssPreflight(compilerOptions, styleOptions)
          : undefined,
    isTailwindcssV4: true,
    tailwindcssV4GradientFallback: styleOptions.tailwindcssV4GradientFallback,
  })
  const output = removeTailwindV4StandaloneHostPreflightRule(finalized)
  return stripMiniProgramCssSpecificityPlaceholders(output)
}

export function shouldFallbackToWebpackUserCssOnGeneratorError(options: {
  configuredMainCssEntryFilesLength: number
  generatorRawSource: string
  hasExplicitTailwindV4SourceCss: boolean
}) {
  return !hasTailwindRootDirectives(options.generatorRawSource, { importFallback: true })
    && !hasTailwindSourceDirectives(options.generatorRawSource, { importFallback: true })
    && !hasTailwindApplyDirective(options.generatorRawSource)
    && !options.hasExplicitTailwindV4SourceCss
    && options.configuredMainCssEntryFilesLength === 0
}
