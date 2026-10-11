import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'
import type { OutputAsset } from 'rollup'
import type { ResolvedConfig } from 'vite'
import type { HmrTimingRecorder } from '../../shared/hmr-timing'
import type { ViteCssAssetIdentity } from '../css-asset-identity'
import type { ViteFrameworkCssPipelineContext, ViteFrameworkCssPipelineStrategy } from '../shared/framework-strategy'
import type { TailwindSourceEntry } from '@/tailwindcss/source-scan'
import type { InternalUserDefinedOptions } from '@/types'
import path from 'node:path'
import { logger } from '@weapp-tailwindcss/logger'
import { transformWebCssCompat } from '@weapp-tailwindcss/postcss/transform'
import { normalizeStyleHandlerMajorVersion } from '@/context/style-options'
import { normalizeWeappTailwindcssGeneratorOptions } from '@/generator'
import { hasLocalCssImport, hasTailwindApplyDirective, hasTailwindRootDirectives } from '../../../generation/directives'
import { hasTailwindGeneratedCssMarkers } from '../../../generation/index'
import { resolveViteWebCssCompatOptions, shouldApplyViteWebCssCompat } from '../web-css-compat'

interface RememberedMainCssSource {
  rawSource: string
  sourceFile: string
}

export interface CssFinalizerContext {
  frameworkName?: string | undefined
  opts: InternalUserDefinedOptions
  getFinalCssCalcOptions?: (() => Partial<IStyleHandlerOptions> | undefined) | undefined
  runtimeState: {
    tailwindRuntime: InternalUserDefinedOptions['tailwindRuntime']
    readyPromise: Promise<void>
  }
  ensureRuntimeClassSet: (force?: boolean) => Promise<Set<string>>
  cssPipelineStrategy?: ViteFrameworkCssPipelineStrategy | undefined
  isCssAssetProcessed: (asset: OutputAsset, file?: string) => boolean
  markCssAssetProcessed: (asset: OutputAsset, file?: string) => void
  debug: (format: string, ...args: unknown[]) => void
  getResolvedConfig: () => ResolvedConfig | undefined
  recordCssAssetResult?: (file: string, css: string) => void
  recordViteProcessedCssAssetResult?: (file: string, css: string, options?: { injectIntoMain?: boolean | undefined, outputFile?: string | undefined }) => void
  getViteProcessedCssAssetResults?: () => Iterable<[string, string | { css: string, injectIntoMain?: boolean | undefined, outputFile?: string | undefined }]>
  getRecordedGeneratorCandidates?: () => Set<string> | undefined
  getSourceCandidates?: () => Set<string>
  getSourceCandidatesForEntries?: ((entries: TailwindSourceEntry[] | undefined) => Set<string>) | undefined
  getSourceCandidateSourcesForEntries?: ((entries: TailwindSourceEntry[] | undefined) => Map<string, Set<string>>) | undefined
  waitForSourceCandidateSyncs?: () => Promise<void>
  rememberMainCssSource?: (file: string, rawSource: string) => void
  getRememberedMainCssSource?: (file: string) => RememberedMainCssSource | undefined
  isViteProcessedCssAsset?: (asset: OutputAsset, file?: string) => boolean
  resolveCssAssetIdentity?: (asset: OutputAsset, file?: string) => ViteCssAssetIdentity
  frameworkRootImportShellTargetByFile?: ReadonlyMap<string, string> | undefined
  hmrTimingRecorder?: HmrTimingRecorder | undefined
}

export interface CssFinalizerThis {
  addWatchFile?: (id: string) => void
}

export function inferPlatformFromViteOutDir(outDir: string | undefined) {
  const segment = outDir ? path.basename(path.normalize(outDir)) : undefined
  if (!segment) {
    return undefined
  }
  const normalized = segment.trim().toLowerCase()
  if (
    normalized === 'h5'
    || normalized === 'web'
    || normalized === 'app'
    || normalized === 'app-plus'
    || normalized.startsWith('app-')
    || normalized.startsWith('mp-')
    || normalized.startsWith('quickapp-webview')
  ) {
    return normalized
  }
}

function isAddWatchFileInvalidRollupPhaseError(error: unknown) {
  const candidate = error as { code?: string, pluginCode?: string, message?: string }
  return candidate?.code === 'INVALID_ROLLUP_PHASE'
    || candidate?.pluginCode === 'INVALID_ROLLUP_PHASE'
    || candidate?.message?.includes('Cannot call "addWatchFile" after the build has finished.') === true
}

export function registerGeneratorDependencies(ctx: CssFinalizerThis, dependencies: readonly string[] | undefined) {
  if (typeof ctx.addWatchFile !== 'function') {
    return
  }
  for (const dependency of dependencies ?? []) {
    try {
      ctx.addWatchFile(dependency)
    }
    catch (error) {
      if (isAddWatchFileInvalidRollupPhaseError(error)) {
        logger.debug('跳过生成模式依赖监听注册，当前 Rollup 阶段不允许 addWatchFile: %s', dependency)
        continue
      }
      throw error
    }
  }
}

export function createCssHandlerOptions(
  opts: InternalUserDefinedOptions,
  majorVersion: number | undefined,
  file: string,
  outputRoot: string | undefined,
  extraOptions: Record<string, unknown> = {},
): IStyleHandlerOptions {
  const from = path.isAbsolute(file)
    ? file
    : outputRoot
      ? path.resolve(outputRoot, file)
      : file
  return {
    ...extraOptions,
    cssPreflight: opts.cssPreflight,
    isMainChunk: opts.mainCssChunkMatcher(file, opts.appType),
    postcssOptions: {
      options: {
        from,
      },
    },
    ...(normalizeStyleHandlerMajorVersion(majorVersion) === undefined ? {} : { majorVersion: 4 as const }),
  }
}

export function shouldGenerateCssByGenerator(
  opts: InternalUserDefinedOptions,
  majorVersion: number | undefined,
  file: string,
  rawSource: string,
  processed: boolean,
) {
  const generatorOptions = normalizeWeappTailwindcssGeneratorOptions(opts.generator, {
    appType: opts.appType,
    platform: opts.cssOptions?.platform ?? opts.platform,
    tailwindcssMajorVersion: majorVersion,
    uniAppX: opts.uniAppX,
  })
  if (!generatorOptions.enabled) {
    return false
  }
  if (hasLocalCssImport(rawSource)) {
    return false
  }
  if (hasTailwindGeneratedCssMarkers(rawSource)) {
    return true
  }
  if (hasTailwindRootDirectives(rawSource, { importFallback: generatorOptions.importFallback })) {
    return true
  }
  return processed
    && hasTailwindApplyDirective(rawSource)
    && shouldFinalizeProcessedCssAsset(opts, file)
}

function shouldFinalizeProcessedCssAsset(
  opts: InternalUserDefinedOptions,
  file: string,
) {
  return opts.mainCssChunkMatcher(file, opts.appType)
}

export function collectViteProcessedCssSources(
  getViteProcessedCssAssetResults: CssFinalizerContext['getViteProcessedCssAssetResults'],
) {
  return [...(getViteProcessedCssAssetResults?.() ?? [])]
    .map(([, record]) => typeof record === 'string' ? record : record.css)
}

export function finalizeWebCss(
  css: string,
  context: ViteFrameworkCssPipelineContext & { file: string },
  cssPipelineStrategy?: ViteFrameworkCssPipelineStrategy | undefined,
) {
  const shouldApplyWebCssCompat = shouldApplyViteWebCssCompat(context, cssPipelineStrategy)
  const defaultWebCssCompat = (value: string) => transformWebCssCompat(
    value,
    resolveViteWebCssCompatOptions(context),
  )
  return cssPipelineStrategy?.transformGeneratedCss?.(css, {
    ...context,
    defaultWebCssCompat,
    removeScopedPreflight: value => value,
    shouldApplyWebCssCompat,
  }) ?? (shouldApplyWebCssCompat ? defaultWebCssCompat(css) : css)
}
