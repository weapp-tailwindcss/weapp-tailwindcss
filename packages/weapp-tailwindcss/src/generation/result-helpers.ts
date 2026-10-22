import type { normalizeWeappTailwindcssGeneratorOptions } from '@/generator/index'
import { normalizeWebCssCompatOptions, transformWebCssCompat } from '@weapp-tailwindcss/postcss/transform'
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
  deferPropertyFallback = false,
) {
  return target === 'web'
    ? transformWebCssCompat(css, webCompat, { deferPropertyFallback })
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
  deferPropertyFallback = false,
) {
  const finalizedIncrementalCss = finalizeMiniProgramGeneratorCss(
    incrementalCss,
    target,
    majorVersion,
    cssPreflight,
    options,
  )
  if (target === 'web') {
    return finalizeWebGeneratorCss(createCssAppend(previousCss, finalizedIncrementalCss), target, webCompat, deferPropertyFallback)
  }
  return createCssAppend(previousCss, finalizedIncrementalCss)
}

/** 已收尾的 CSS 不含默认值来源身份；注册兼容开启时必须重新消费完整生成结果。 */
export function canAppendGeneratorCss(target: string, webCompat: Parameters<typeof normalizeWebCssCompatOptions>[0]) {
  return target !== 'web' || !normalizeWebCssCompatOptions(webCompat).features.property
}
