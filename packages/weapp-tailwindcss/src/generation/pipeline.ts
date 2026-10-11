import type { GenerateCssByGeneratorOptions, GenerateCssByGeneratorResult } from './types'
import { postcss, removeUnsupportedMiniProgramAtRules } from '@weapp-tailwindcss/postcss/transform'
import { normalizeWeappTailwindcssGeneratorOptions } from '@/generator/index'
import { resolveGeneratorRuntimeBranch, shouldUseMiniProgramCssBranch } from '@/runtime-branch'
import { hasTailwindApplyDirective, hasTailwindSourceDirectives, normalizeTailwindSourceDirectives } from './directives'
import { deduplicateGeneratedCssRules, finalizeMiniProgramGeneratorCss, shouldUseGeneratorForCurrentCss } from './generation-helpers'
import { cleanLocalCssImportWrapperTailwindDirectives, cleanLocalCssImportWrapperTailwindDirectivesRoot, isPureLocalCssImportWrapper, isPureLocalCssImportWrapperRoot, restoreLocalCssImports, splitLocalCssImports, splitLocalCssImportsRoot } from './local-imports'
import { createCssAppend, GENERATOR_PLACEHOLDER_MARKER_RE, hasTailwindGeneratedCss, hasTailwindGeneratedCssMarkers, splitTailwindV4GeneratedCssBySourceOrder } from './markers'
import { normalizeMiniProgramGeneratorCssSource, removeMiniProgramOutputImports } from './output-import-shell'
import { executeGeneratorPipeline } from './pipeline/execution'
import { finalizeWebGeneratorCss, resolveGeneratedCssClassSet } from './result-helpers'
import { normalizeCssSourceForCompare } from './source-resolver/matching'
import { hasUserCssLayerBlocks, isCommentOnlyCss, normalizeEmptyTailwindCustomVariants, removeTailwindV4GeneratorAtRules, splitUserCssLayerBlocks, stripTailwindSourceMediaFragments, stripUnmatchedTailwindSourceMediaCloseFragments } from './user-css'

function hasPostcssUserPlugins(options: GenerateCssByGeneratorOptions['cssHandlerOptions']) {
  const plugins = options.postcssOptions?.plugins
  if (Array.isArray(plugins)) {
    return plugins.length > 0
  }
  return typeof plugins === 'object' && plugins !== null && Object.keys(plugins).length > 0
}

function shouldProcessDisabledGeneratorCss(rawSource: string, options: GenerateCssByGeneratorOptions['cssHandlerOptions']) {
  if (!hasPostcssUserPlugins(options)) {
    return false
  }
  return /@import\s+(?:url\(\s*)?["']tailwindcss(?:\/[^"')\s]*)?["']/.test(rawSource)
    || hasTailwindApplyDirective(rawSource)
}

function parseCssSourceRoot(rawSource: string) {
  try {
    return postcss.parse(rawSource)
  }
  catch {
    return undefined
  }
}

function cleanLocalCssImportWrapperFromParsedRoot(rawSource: string, root: postcss.Root | undefined) {
  if (!root) {
    return cleanLocalCssImportWrapperTailwindDirectives(rawSource)
  }
  return cleanLocalCssImportWrapperTailwindDirectivesRoot(root)
    ? root.toString()
    : undefined
}

function isPureLocalCssImportWrapperFromParsedRoot(rawSource: string, root: postcss.Root | undefined) {
  return root
    ? isPureLocalCssImportWrapperRoot(root)
    : isPureLocalCssImportWrapper(rawSource)
}

function splitLocalCssImportsFromParsedRoot(rawSource: string, root: postcss.Root | undefined) {
  return root
    ? splitLocalCssImportsRoot(root)
    : splitLocalCssImports(rawSource)
}

export async function generateCssByGenerator(
  options: GenerateCssByGeneratorOptions,
): Promise<GenerateCssByGeneratorResult | undefined> {
  const {
    opts,
    runtimeState,
    runtime,
    rawSource,
    file,
    cssHandlerOptions,
    cssUserHandlerOptions,
    getSourceCandidatesForEntries,
    styleHandler,
    generatorPlatform,
    userRawSource,
    userRawSourceProcessed,
    debug,
  } = options
  const platform = generatorPlatform ?? opts.cssOptions?.platform ?? opts.platform
  const generatorOptions = {
    ...normalizeWeappTailwindcssGeneratorOptions(opts.generator, {
      appType: opts.appType,
      platform,
      tailwindcssMajorVersion: runtimeState.tailwindRuntime.majorVersion,
      uniAppX: opts.uniAppX,
    }),
    bareArbitraryValues: opts.arbitraryValues?.bareArbitraryValues,
  }
  const generatorBranch = resolveGeneratorRuntimeBranch(generatorOptions, {
    appType: opts.appType,
    platform,
    tailwindcssMajorVersion: runtimeState.tailwindRuntime.majorVersion,
    uniAppX: opts.uniAppX,
  })
  const majorVersion = runtimeState.tailwindRuntime.majorVersion
  if (majorVersion !== 4) {
    throw new Error('weapp-tailwindcss 生成管线仅支持 Tailwind CSS v4。')
  }
  const useMiniProgramCssBranch = shouldUseMiniProgramCssBranch(generatorBranch)
  const normalizeGeneratorCssSource = (css: string) => {
    return useMiniProgramCssBranch
      ? normalizeMiniProgramGeneratorCssSource(css, file)
      : css
  }
  const normalizeGeneratorSource = <T extends { css: string }>(source: T): T => {
    // 产物导入由外层 localImports 重放，不能交给 Tailwind 按源码路径解析。
    const css = useMiniProgramCssBranch
      ? removeMiniProgramOutputImports(normalizeGeneratorCssSource(source.css))
      : source.css
    return css === source.css
      ? source
      : {
          ...source,
          css,
        }
  }
  if (!generatorOptions.enabled) {
    debug('tailwind direct css generation disabled: %s', file)
    if (shouldProcessDisabledGeneratorCss(rawSource, cssHandlerOptions)) {
      const handled = await styleHandler(rawSource, cssHandlerOptions)
      return {
        css: finalizeWebGeneratorCss(handled.css, generatorOptions.target, generatorOptions.webCompat),
        classSet: resolveGeneratedCssClassSet(
          generatorOptions.target,
          new Set(),
          runtime,
          handled.css,
          opts.escapeMap,
          options.previousClassSet,
        ),
        target: generatorOptions.target,
        source: 'generator',
        dependencies: [],
        metadata: {
          file,
          majorVersion,
          rawCss: rawSource,
        },
      }
    }
    return undefined
  }
  const effectiveRawSource = stripUnmatchedTailwindSourceMediaCloseFragments(
    stripTailwindSourceMediaFragments(
      normalizeEmptyTailwindCustomVariants(
        normalizeGeneratorCssSource(
          normalizeTailwindSourceDirectives(rawSource, {
            importFallback: generatorOptions.importFallback,
          }),
        ),
      ),
    ),
  )
  const effectiveRawSourceRoot = parseCssSourceRoot(effectiveRawSource)
  const cleanedLocalImportWrapper = cleanLocalCssImportWrapperFromParsedRoot(effectiveRawSource, effectiveRawSourceRoot)
  if (cleanedLocalImportWrapper !== undefined) {
    return {
      css: shouldUseMiniProgramCssBranch(generatorBranch)
        ? removeUnsupportedMiniProgramAtRules(cleanedLocalImportWrapper)
        : cleanedLocalImportWrapper,
      classSet: new Set(),
      target: generatorOptions.target,
      source: 'generator',
      dependencies: [],
      metadata: {
        file,
        majorVersion,
      },
    }
  }

  if (isPureLocalCssImportWrapperFromParsedRoot(effectiveRawSource, effectiveRawSourceRoot)) {
    return undefined
  }

  const localImportParts = splitLocalCssImportsFromParsedRoot(effectiveRawSource, effectiveRawSourceRoot)
  const localImports = options.restoreLocalCssImports === false
    ? undefined
    : localImportParts?.imports
  const finalizeGeneratorCss = (css: string, target: string, finalizeOptions: Parameters<typeof finalizeMiniProgramGeneratorCss>[4] = {}) => {
    return finalizeWebGeneratorCss(
      restoreLocalCssImports(
        finalizeMiniProgramGeneratorCss(css, target, majorVersion, opts.cssPreflight, finalizeOptions),
        localImports,
        { outputFile: file },
      ),
      target,
      generatorOptions.webCompat,
    )
  }
  const generatorRawSource = localImportParts?.source ?? effectiveRawSource
  const rawUserSource = userRawSource === undefined
    ? generatorRawSource
    : userRawSourceProcessed
      ? userRawSource
      : stripUnmatchedTailwindSourceMediaCloseFragments(
          stripTailwindSourceMediaFragments(
            normalizeEmptyTailwindCustomVariants(
              normalizeGeneratorCssSource(
                normalizeTailwindSourceDirectives(userRawSource, {
                  importFallback: generatorOptions.importFallback,
                }),
              ),
            ),
          ),
        )
  const userLocalImportParts = rawUserSource === generatorRawSource
    ? undefined
    : splitLocalCssImports(rawUserSource)
  const userSource = userLocalImportParts?.source ?? rawUserSource
  const userCssRawSource = removeTailwindV4GeneratorAtRules(userSource)
  const hasWebUserCssFallbackSource = userCssRawSource.trim().length > 0
    && !isCommentOnlyCss(userCssRawSource)
  const generatedUserCssOrderSource = hasTailwindGeneratedCss(userSource)
    ? splitTailwindV4GeneratedCssBySourceOrder(userSource, generatorRawSource)
    : undefined
  const generatedUserCssRawSource = generatedUserCssOrderSource
    ? createCssAppend(generatedUserCssOrderSource.before, generatedUserCssOrderSource.after)
    : hasTailwindGeneratedCss(userSource)
      ? ''
      : userCssRawSource
  const userCssOrderSource = GENERATOR_PLACEHOLDER_MARKER_RE.test(userSource)
    ? userSource
    : hasTailwindGeneratedCss(userSource)
      ? userSource
      : generatedUserCssRawSource
  const hasDistinctUserRawSource = typeof userRawSource === 'string'
    && normalizeCssSourceForCompare(generatedUserCssRawSource) !== normalizeCssSourceForCompare(generatorRawSource)
  const legacyCompatUserCssRawSource = generatorOptions.target === 'weapp'
    && hasUserCssLayerBlocks(generatedUserCssRawSource)
    ? splitUserCssLayerBlocks(generatedUserCssRawSource).rest
    : generatedUserCssRawSource
  const shouldPreserveLegacyCompatSelectorOverrides = legacyCompatUserCssRawSource !== generatedUserCssRawSource
  const shouldDeduplicateUserLayerCss = generatorOptions.target === 'weapp'
    && (
      hasUserCssLayerBlocks(rawUserSource)
      || hasUserCssLayerBlocks(generatorRawSource)
      || hasUserCssLayerBlocks(generatedUserCssRawSource)
    )
  const prepareFinalGeneratorCss = (css: string) => shouldDeduplicateUserLayerCss
    ? deduplicateGeneratedCssRules(css)
    : css

  const hasGeneratedCss = hasTailwindGeneratedCss(generatorRawSource)
  const hasSourceDirectives = hasTailwindSourceDirectives(generatorRawSource, {
    importFallback: generatorOptions.importFallback,
  })
  const hasGeneratedMarkers = hasTailwindGeneratedCssMarkers(generatorRawSource)
  const normalizedCssSources = options.cssSources?.map((source) => {
    const css = normalizeGeneratorCssSource(normalizeEmptyTailwindCustomVariants(source.css))
    return css === source.css
      ? source
      : {
          ...source,
          css,
        }
  })
  const shouldGenerateCurrentCss = shouldUseGeneratorForCurrentCss(majorVersion, cssHandlerOptions, {
    forceGenerator: options.forceGenerator,
    hasGeneratedCss,
    hasGeneratedMarkers,
    hasSourceDirectives,
    rawSource: generatorRawSource,
    runtimeCandidateCount: runtime.size,
    target: generatorOptions.target,
    configuredCssSourceCount: options.cssSources?.length,
  })

  if (
    !shouldGenerateCurrentCss
  ) {
    return undefined
  }

  try {
    return await executeGeneratorPipeline({
      cssHandlerOptions,
      cssUserHandlerOptions,
      debug,
      file,
      finalizeGeneratorCss,
      generatedUserCssRawSource,
      generatorBranch,
      generatorOptions,
      generatorRawSource,
      getSourceCandidatesForEntries,
      hasDistinctUserRawSource,
      hasGeneratedCss,
      hasGeneratedMarkers,
      hasSourceDirectives,
      hasWebUserCssFallbackSource,
      legacyCompatUserCssRawSource,
      localImports,
      majorVersion,
      normalizeGeneratorSource,
      normalizedCssSources,
      options,
      opts,
      prepareFinalGeneratorCss,
      runtime,
      runtimeState,
      shouldPreserveLegacyCompatSelectorOverrides,
      styleHandler,
      userCssOrderSource,
      userCssRawSource,
      userRawSourceProcessed,
      useMiniProgramCssBranch,
    })
  }
  catch (error) {
    debug('tailwind direct css generation failed: %s %O', file, error)
    throw error
  }

  return undefined
}
