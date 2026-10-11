import type { normalizeWeappTailwindcssGeneratorOptions } from '@/generator/index'
import { transformWebCssCompat } from '@weapp-tailwindcss/postcss/transform'
import { collectGeneratedRawSourceCandidates } from './class-selectors'
import { finalizeMiniProgramGeneratorCss } from './generation-helpers'
import { createCssAppend } from './markers'

export { isCssAlreadyRepresentedByMarkers } from '@weapp-tailwindcss/postcss/transform'

function mergeGeneratedCssClassSet(
  classSet: ReadonlySet<string>,
  candidates: Iterable<string>,
  css: string,
  escapeMap: Record<string, string> | undefined,
) {
  const merged = new Set(classSet)
  for (const candidate of collectGeneratedRawSourceCandidates(candidates, css, escapeMap)) {
    merged.add(candidate)
  }
  return merged
}

export function resolveGeneratedCssClassSet(
  target: string,
  classSet: ReadonlySet<string>,
  candidates: Iterable<string>,
  css: string,
  escapeMap: Record<string, string> | undefined,
  previousClassSet?: Set<string> | undefined,
) {
  if (target === 'web') {
    return new Set([
      ...(previousClassSet ?? []),
      ...classSet,
    ])
  }
  return mergeGeneratedCssClassSet(classSet, candidates, css, escapeMap)
}

export function finalizeWebGeneratorCss(
  css: string,
  target: string,
  webCompat: ReturnType<typeof normalizeWeappTailwindcssGeneratorOptions>['webCompat'],
) {
  return target === 'web'
    ? transformWebCssCompat(css, webCompat)
    : css
}

export function finalizeIncrementalGeneratorCss(
  previousCss: string,
  incrementalCss: string,
  target: string,
  majorVersion: number | undefined,
  cssPreflight: Parameters<typeof finalizeMiniProgramGeneratorCss>[3],
  options: Parameters<typeof finalizeMiniProgramGeneratorCss>[4],
  webCompat: ReturnType<typeof normalizeWeappTailwindcssGeneratorOptions>['webCompat'],
) {
  const finalizedIncrementalCss = finalizeMiniProgramGeneratorCss(
    incrementalCss,
    target,
    majorVersion,
    cssPreflight,
    options,
  )
  if (target === 'web') {
    return createCssAppend(previousCss, finalizeWebGeneratorCss(finalizedIncrementalCss, target, webCompat))
  }
  return createCssAppend(previousCss, finalizedIncrementalCss)
}
