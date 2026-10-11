import { collectRawSourceClassSelectors, normalizeCssClassSelector } from '@weapp-tailwindcss/postcss/transform'
import { replaceWxml } from '@/wxml/shared'

export { collectRawSourceClassSelectors }

export function collectGeneratedRawSourceCandidates(
  candidates: Iterable<string>,
  rawSource: string,
  escapeMap: Record<string, string> | undefined,
) {
  const selectors = collectRawSourceClassSelectors(rawSource)
  if (selectors.size === 0) {
    return new Set<string>()
  }
  const matched = new Set<string>()
  for (const candidate of candidates) {
    const escaped = normalizeCssClassSelector(replaceWxml(candidate, { escapeMap }))
    if (selectors.has(candidate) || selectors.has(escaped)) {
      matched.add(candidate)
    }
  }
  return matched
}

export function collectGeneratedRawSourceCandidatesFromCss(
  candidates: Iterable<string>,
  cssSources: Iterable<string>,
  escapeMap: Record<string, string> | undefined,
) {
  const matched = new Set<string>()
  for (const css of cssSources) {
    for (const candidate of collectGeneratedRawSourceCandidates(candidates, css, escapeMap)) {
      matched.add(candidate)
    }
  }
  return matched
}
