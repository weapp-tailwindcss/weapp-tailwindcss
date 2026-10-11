import type { RememberedCssSource } from './types'
import { sourcePathApi } from '@weapp-tailwindcss/source-scan'
import {
  hasTailwindApplyDirective,
  hasTailwindRootDirectives,
  hasTailwindSourceDirectives,
} from '../../../generation/directives'
import { hasUserCssLayerBlocks } from '../../../generation/user-css'
import { normalizeOutputPathKey } from '../../shared/module-graph'
import { normalizeCssSourceForCompare } from '../css-output'
import { mergeRememberedCssSources } from './remembered-css'
import { hasScopedSourceDirectives } from './scoped-generator-sources'
import { hasTailwindGenerationSource } from './sfc-style-source'

export interface CssCompositionHandlerOptions {
  isMainChunk?: boolean | undefined
  sourceOptions?: {
    cssEntries?: string[] | undefined
    sourceFile?: string | undefined
  } | undefined
}

export interface ResolveViteCssCompositionPlanOptions<HandlerOptions extends CssCompositionHandlerOptions> {
  assetSourceFile: string
  configuredSourceFileKeys: ReadonlySet<string>
  cssEntries: string[] | undefined
  cssMatcher: (file: string) => boolean
  explicitSourceFileKeys: ReadonlySet<string>
  file: string
  getCssHandlerOptions: (file: string) => HandlerOptions
  getOriginalCssLayerSource: ((file: string) => string | undefined) | undefined
  isRootStyleOutputFile: (file: string) => boolean
  isWebGeneratorTarget: boolean
  normalizeConfiguredSourceFile: (file: string) => string
  normalizeGeneratorSource: (source: string, outputFile: string) => string
  normalizeGeneratorUserSource: (source: string, sourceFile: string, fallbackFile: string) => string
  outputCssHandlerOptions: HandlerOptions
  outputFile: string
  rawSource: string
  rememberedSources: RememberedCssSource[]
  resolveConfiguredRootInjectionTarget: (sourceFile: string, outputFile: string) => string | undefined
  resolveMatchedOutputFile: (sourceFile: string) => string | undefined
  resolvedFromTemporarySource: boolean
  rootImportShellOutputFile: string
  shouldKeepImportedCssShell: boolean
  shouldKeepRootImportShell: boolean
  shouldMoveRootImportShellToOrigin: boolean
  shouldSkipRememberedSource: (source: RememberedCssSource) => boolean
  viteProcessedCssAsset: boolean
}

export interface ViteCssCompositionPlan<HandlerOptions extends CssCompositionHandlerOptions> {
  cssHandlerOptions: HandlerOptions
  generatorCssHandlerOptions: HandlerOptions
  generatorRawSource: string
  generatorSourceFile: string
  generatorUserLayerRawSource: string | undefined
  hasCurrentTailwindGenerationDirective: boolean
  hasRememberedApplySource: boolean
  hasSameOutputRememberedTailwindGenerationSource: boolean
  hasStaleViteProcessedCssSource: boolean
  outputCssHandlerOptions: HandlerOptions
  outputFile: string
  preserveImportedCssShell: boolean
  rememberedSource: RememberedCssSource | undefined
  rememberedSources: RememberedCssSource[]
  rootImportShellTarget: string | undefined
  usedConfiguredSourceFile: string | undefined
  usesConfiguredTailwindV4FallbackSource: boolean
  vitePipelineCssAsset: boolean
  webviewRootCssInjectionTarget: string | undefined
}

export function resolveViteCssCompositionPlan<HandlerOptions extends CssCompositionHandlerOptions>(
  options: ResolveViteCssCompositionPlanOptions<HandlerOptions>,
): ViteCssCompositionPlan<HandlerOptions> {
  const rememberedSources = options.rememberedSources.filter(source =>
    !options.shouldSkipRememberedSource(source),
  )
  let outputFile = options.outputFile
  let outputCssHandlerOptions = options.outputCssHandlerOptions
  let rememberedSource = mergeRememberedCssSources(rememberedSources, outputFile)
  if (
    rememberedSource
    && options.viteProcessedCssAsset
    && outputCssHandlerOptions.isMainChunk !== true
    && options.configuredSourceFileKeys.has(
      options.normalizeConfiguredSourceFile(rememberedSource.sourceFile),
    )
  ) {
    const matchedOutputFile = options.resolveMatchedOutputFile(rememberedSource.sourceFile)
    if (matchedOutputFile && normalizeOutputPathKey(matchedOutputFile) !== normalizeOutputPathKey(outputFile)) {
      outputFile = matchedOutputFile
      outputCssHandlerOptions = options.getCssHandlerOptions(outputFile)
      rememberedSource = {
        ...rememberedSource,
        outputFile,
      }
    }
  }
  const rootImportShellTarget = !options.isWebGeneratorTarget
    && options.isRootStyleOutputFile(options.rootImportShellOutputFile)
    && options.isRootStyleOutputFile(outputFile)
    && normalizeOutputPathKey(options.rootImportShellOutputFile) !== normalizeOutputPathKey(outputFile)
    && options.shouldKeepRootImportShell
    && !options.shouldMoveRootImportShellToOrigin
    ? outputFile
    : undefined
  const useRememberedCssSource = !options.shouldKeepImportedCssShell
    && rememberedSource != null
    && (
      normalizeOutputPathKey(rememberedSource.sourceFile) !== normalizeOutputPathKey(options.file)
      || (
        !hasTailwindGenerationSource(options.rawSource)
        && hasTailwindGenerationSource(rememberedSource.rawSource)
      )
    )
  const vitePipelineCssAsset = options.viteProcessedCssAsset || useRememberedCssSource
  const resolvedGeneratorRawSource = vitePipelineCssAsset
    ? rememberedSource?.rawSource ?? options.rawSource
    : options.rawSource
  const generatorRawSource = options.normalizeGeneratorSource(resolvedGeneratorRawSource, outputFile)
  const hasCurrentTailwindGenerationDirective = hasTailwindSourceDirectives(options.rawSource, { importFallback: true })
    || hasTailwindRootDirectives(options.rawSource, { importFallback: true })
    || hasTailwindApplyDirective(options.rawSource)
  const preserveImportedCssShell = options.shouldKeepImportedCssShell
    && !hasCurrentTailwindGenerationDirective
  const hasRememberedApplySource = vitePipelineCssAsset
    && rememberedSource != null
    && hasTailwindApplyDirective(generatorRawSource)
  const hasDifferentRememberedCssSource = rememberedSource != null
    && normalizeCssSourceForCompare(rememberedSource.rawSource)
    !== normalizeCssSourceForCompare(options.rawSource)
  const hasRememberedApplyDirective = rememberedSource != null
    && hasTailwindApplyDirective(rememberedSource.rawSource)
  const hasRememberedTailwindGenerationSource = rememberedSource != null
    && hasTailwindGenerationSource(rememberedSource.rawSource)
  const hasSameOutputRememberedTailwindGenerationSource = hasRememberedTailwindGenerationSource
    && rememberedSource != null
    && normalizeOutputPathKey(rememberedSource.outputFile) === normalizeOutputPathKey(outputFile)
  const hasStaleViteProcessedCssSource = vitePipelineCssAsset
    && hasDifferentRememberedCssSource
    && (
      hasCurrentTailwindGenerationDirective
      || hasRememberedApplyDirective
      || hasRememberedTailwindGenerationSource
    )
  const generatorSourceFile = vitePipelineCssAsset
    ? rememberedSource?.sourceFile ?? options.assetSourceFile
    : options.assetSourceFile
  const originalGeneratorLayerSource = vitePipelineCssAsset
    ? options.getOriginalCssLayerSource?.(generatorSourceFile)
    : undefined
  const generatorUserLayerRawSource = originalGeneratorLayerSource
    && normalizeCssSourceForCompare(originalGeneratorLayerSource)
    !== normalizeCssSourceForCompare(generatorRawSource)
    && hasUserCssLayerBlocks(originalGeneratorLayerSource)
    ? options.normalizeGeneratorSource(
        options.normalizeGeneratorUserSource(
          originalGeneratorLayerSource,
          generatorSourceFile,
          options.assetSourceFile,
        ),
        outputFile,
      )
    : undefined
  const webviewRootCssInjectionTarget = vitePipelineCssAsset
    ? options.resolveConfiguredRootInjectionTarget(generatorSourceFile, outputFile)
    : undefined
  const usesConfiguredTailwindV4FallbackSource = rememberedSource != null
    && normalizeOutputPathKey(rememberedSource.outputFile) === normalizeOutputPathKey(outputFile)
    && normalizeOutputPathKey(rememberedSource.sourceFile.replace(/[?#].*$/, ''))
    !== normalizeOutputPathKey(options.file)
  const configuredSourceFile = vitePipelineCssAsset
    && outputCssHandlerOptions.isMainChunk !== true
    && options.configuredSourceFileKeys.has(options.normalizeConfiguredSourceFile(generatorSourceFile))
    ? generatorSourceFile
    : undefined
  const cssHandlerOptions = vitePipelineCssAsset
    ? {
        ...options.getCssHandlerOptions(generatorSourceFile),
        isMainChunk: options.resolvedFromTemporarySource
          ? false
          : outputCssHandlerOptions.isMainChunk,
      }
    : options.getCssHandlerOptions(options.file)
  const generatorSourceFileKey = options.normalizeConfiguredSourceFile(generatorSourceFile)
  const isExplicitGeneratorCssEntry = options.explicitSourceFileKeys.has(generatorSourceFileKey)
  const shouldUsePipelineSourceAsCssEntry = !isExplicitGeneratorCssEntry
    && vitePipelineCssAsset
    && options.cssMatcher(generatorSourceFile)
    && hasTailwindGenerationSource(generatorRawSource)
  const generatorCssEntries = isExplicitGeneratorCssEntry || shouldUsePipelineSourceAsCssEntry
    ? [generatorSourceFile]
    : options.cssEntries
  const hasScopedSources = hasScopedSourceDirectives(rememberedSources)
  const generatorCssHandlerOptions = {
    ...cssHandlerOptions,
    sourceOptions: {
      ...cssHandlerOptions.sourceOptions,
      sourceFile: generatorSourceFile,
      cssEntries: hasScopedSources ? rememberedSources.map(source => source.sourceFile) : generatorCssEntries,
      ...(hasScopedSources
        ? {
            cssSources: rememberedSources.map(source => ({ file: source.sourceFile, base: sourcePathApi(source.sourceFile).dirname(source.sourceFile), css: source.rawSource })),
          }
        : {}),
    },
  }
  return {
    cssHandlerOptions,
    generatorCssHandlerOptions,
    generatorRawSource,
    generatorSourceFile,
    generatorUserLayerRawSource,
    hasCurrentTailwindGenerationDirective,
    hasRememberedApplySource,
    hasSameOutputRememberedTailwindGenerationSource,
    hasStaleViteProcessedCssSource,
    outputCssHandlerOptions,
    outputFile,
    preserveImportedCssShell,
    rememberedSource,
    rememberedSources,
    rootImportShellTarget,
    usedConfiguredSourceFile: configuredSourceFile,
    usesConfiguredTailwindV4FallbackSource,
    vitePipelineCssAsset,
    webviewRootCssInjectionTarget,
  }
}
