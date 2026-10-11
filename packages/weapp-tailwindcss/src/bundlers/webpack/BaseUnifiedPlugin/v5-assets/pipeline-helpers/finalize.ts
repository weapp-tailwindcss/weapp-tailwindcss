import type { createEscapeFragments } from '../../../../shared/runtime-class-set/escaped-candidates'
import type { SetupWebpackV5ProcessAssetsHookOptions, WebpackSourceLike } from '../helpers'
import type { WebpackCssHandlerOptions, WebpackSourceCandidateCache } from './preflight-runtime'
import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { dedupeCoveredCssRules } from '@weapp-tailwindcss/postcss/transform'
import { resolveStyleOptionsFromContext } from '@/context/style-options'
import { removeTailwindSourceDirectives } from '../../../../../generation/directives'
import { hasMiniProgramTailwindV4PreflightReset } from '../../../../../generation/generation-helpers'
import { removeMiniProgramInteractiveSelectors, removeTailwindV4GeneratorAtRules, stripTailwindSourceMediaFragments, stripUnmatchedTailwindSourceMediaCloseFragments } from '../../../../../generation/user-css'
import { finalizeMiniProgramCss, pruneMiniProgramGeneratedCss, stripMiniProgramCssSpecificityPlaceholders } from '../../../../shared/css-cleanup'
import { createCssTokenSourceMap, isCssSourceTraceEnabled } from '../../../../shared/css-source-trace'
import { finalizeMiniProgramCssStructure } from '../../../../shared/final-css-cleanup'
import { stripBundlerGeneratedCssMarkers } from '../../../../shared/generated-css-marker'
import { collectStrictEscapedRuntimeCandidates } from '../../../../shared/runtime-class-set/escaped-candidates'
import { finalizeMiniProgramUserCssAssetSource, shouldInjectWebpackCssTracePreflight } from './memory-trace'
import { collectRuntimeTokenSignatureParts, dedupeMiniProgramPreflightSelectorRules, ensureWebpackMiniProgramTwContentInit, hasMiniProgramPreflightSelector, isRuntimeTransformCandidate, removeMiniProgramPreflightSelectorRule, resolveExistingWebpackCssPreflight, stripTrailingLineWhitespace } from './preflight-runtime'

export function finalizeTracedWebpackCssAsset(
  css: string,
  cssHandlerOptions: WebpackCssHandlerOptions,
  options: {
    annotateCss: (css: string) => string
    compilerOptions: SetupWebpackV5ProcessAssetsHookOptions['options']
    finalized?: boolean | undefined
    isWebGeneratorTarget: boolean
  },
) {
  if (options.finalized === true) {
    return options.annotateCss(css)
  }
  if (options.isWebGeneratorTarget || !isCssSourceTraceEnabled(options.compilerOptions)) {
    return options.annotateCss(css)
  }
  const finalized = finalizeMiniProgramUserCssAssetSource(
    css,
    options.compilerOptions,
    options.isWebGeneratorTarget,
    {
      cssPreflight: shouldInjectWebpackCssTracePreflight(options.compilerOptions.appType, cssHandlerOptions),
    },
  )
  return options.annotateCss(finalized)
}

export function finalizeWebpackCssAssetSource(
  source: string,
  compilerOptions: SetupWebpackV5ProcessAssetsHookOptions['options'],
  isWebGeneratorTarget: boolean,
  options: { cssPreflight?: boolean | undefined, generatedCss?: boolean, preserveExistingPreflight?: boolean | undefined } = {},
) {
  const styleOptions = resolveStyleOptionsFromContext(compilerOptions)
  if (isWebGeneratorTarget) {
    if (options.generatedCss === true) {
      return stripTrailingLineWhitespace(
        stripUnmatchedTailwindSourceMediaCloseFragments(
          stripTailwindSourceMediaFragments(
            stripBundlerGeneratedCssMarkers(source),
          ),
        ),
      )
    }
    const finalized = removeTailwindSourceDirectives(
      stripBundlerGeneratedCssMarkers(source),
      { importFallback: true },
    )
    return stripTrailingLineWhitespace(
      stripUnmatchedTailwindSourceMediaCloseFragments(
        stripTailwindSourceMediaFragments(
          removeTailwindV4GeneratorAtRules(finalized),
        ),
      ),
    )
  }
  let finalized = removeTailwindSourceDirectives(
    stripBundlerGeneratedCssMarkers(source),
    { importFallback: true },
  )
  if (options.generatedCss !== true) {
    finalized = finalizeMiniProgramCss(finalized, {
      cssPreflight: false,
      isTailwindcssV4: true,
      tailwindcssV4GradientFallback: styleOptions.tailwindcssV4GradientFallback,
    })
    finalized = dedupeMiniProgramPreflightSelectorRules(finalized)
    return stripMiniProgramCssSpecificityPlaceholders(removeMiniProgramInteractiveSelectors(finalized, {
      active: styleOptions.cssRemoveActivePseudoClass ?? true,
      hover: styleOptions.cssRemoveHoverPseudoClass ?? true,
    }))
  }
  try {
    finalized = pruneMiniProgramGeneratedCss(finalized, {
      preservePreflight: options.cssPreflight !== false,
    })
  }
  catch {
  }
  const shouldRemoveExistingPreflight = options.cssPreflight === false && options.preserveExistingPreflight === false
  if (shouldRemoveExistingPreflight) {
    finalized = removeMiniProgramPreflightSelectorRule(finalized)
  }
  const hasExistingMiniProgramPreflight = options.preserveExistingPreflight !== false
    && hasMiniProgramPreflightSelector(source)
  finalized = finalizeMiniProgramCss(finalized, {
    cssPreflight: options.cssPreflight === false && !hasExistingMiniProgramPreflight
      ? false
      : !hasMiniProgramTailwindV4PreflightReset(finalized)
          ? resolveExistingWebpackCssPreflight(compilerOptions, styleOptions, source)
          : undefined,
    isTailwindcssV4: true,
    tailwindcssV4GradientFallback: styleOptions.tailwindcssV4GradientFallback,
  })
  finalized = ensureWebpackMiniProgramTwContentInit(finalized)
  if (shouldRemoveExistingPreflight) {
    finalized = removeMiniProgramPreflightSelectorRule(finalized)
  }
  else {
    finalized = dedupeMiniProgramPreflightSelectorRules(finalized)
  }
  return stripMiniProgramCssSpecificityPlaceholders(removeMiniProgramInteractiveSelectors(finalized, {
    active: styleOptions.cssRemoveActivePseudoClass ?? true,
    hover: styleOptions.cssRemoveHoverPseudoClass ?? true,
  }))
}

export function finalizeWebpackCssAssetOutputSource(
  source: string,
  compilerOptions: SetupWebpackV5ProcessAssetsHookOptions['options'],
  isWebGeneratorTarget: boolean,
) {
  if (isWebGeneratorTarget) {
    return source
  }
  const styleOptions = resolveStyleOptionsFromContext(compilerOptions)
  const finalized = stripMiniProgramCssSpecificityPlaceholders(
    removeMiniProgramInteractiveSelectors(
      dedupeCoveredCssRules(dedupeMiniProgramPreflightSelectorRules(source)),
      {
        active: styleOptions.cssRemoveActivePseudoClass ?? true,
        hover: styleOptions.cssRemoveHoverPseudoClass ?? true,
      },
    ),
  )
  return finalizeMiniProgramCssStructure(finalized)
}

export function collectWebpackJsRuntimeCandidatesFromAssets(options: {
  escapeFragments: ReturnType<typeof createEscapeFragments>
  getAssetSource: (file: string) => WebpackSourceLike | undefined
  isWebGeneratorTarget: boolean
  jsAssets: Iterable<string>
}) {
  if (options.isWebGeneratorTarget) {
    return undefined
  }
  const candidates = new Set<string>()
  for (const file of options.jsAssets) {
    const sourceLike = options.getAssetSource(file)
    if (sourceLike === undefined) {
      continue
    }
    const source = stringifyWebpackSourceLike(sourceLike)
    for (const candidate of collectStrictEscapedRuntimeCandidates(source, MappingChars2String, options.escapeFragments)) {
      if (isRuntimeTransformCandidate(candidate)) {
        candidates.add(candidate)
      }
    }
  }
  return candidates
}

export function collectWebpackJsRuntimeTokenSignature(options: {
  getAssetSource: (file: string) => WebpackSourceLike | undefined
  isWebGeneratorTarget: boolean
  jsAssets: Iterable<string>
}) {
  if (options.isWebGeneratorTarget) {
    return ''
  }
  const tokens: string[] = []
  for (const file of options.jsAssets) {
    const sourceLike = options.getAssetSource(file)
    if (sourceLike === undefined) {
      continue
    }
    tokens.push(...collectRuntimeTokenSignatureParts(stringifyWebpackSourceLike(sourceLike)))
  }
  return tokens.sort().join('\n')
}

export function addRuntimeTransformCandidates(
  target: Set<string>,
  candidates: ReadonlySet<string> | undefined,
) {
  if (!candidates?.size) {
    return
  }
  for (const candidate of candidates) {
    if (isRuntimeTransformCandidate(candidate)) {
      target.add(candidate)
    }
  }
}

export function createWebpackCssSourceTraceTokenSources(
  compilerOptions: SetupWebpackV5ProcessAssetsHookOptions['options'],
  webpackSourceCandidates: WebpackSourceCandidateCache | undefined,
) {
  if (!isCssSourceTraceEnabled(compilerOptions) || !webpackSourceCandidates) {
    return undefined
  }
  return createCssTokenSourceMap(webpackSourceCandidates.tokenSources, compilerOptions)
}

export function stringifyOptionalWebpackSourceValue(value: unknown) {
  return typeof value === 'string'
    ? value
    : value?.toString() ?? ''
}

export function stringifyWebpackSourceLike(source: WebpackSourceLike) {
  if (typeof source === 'string') {
    return source
  }
  const value = source.source()
  return typeof value === 'string' ? value : value.toString()
}
