import type { ComparableCssCoverage } from './coverage'
import postcss from 'postcss'
import { removeCssRuleWithSourceTrace } from '../../utils/css-source-trace'
import { isSkylineTypographyResetRule, retainSkylineTypographyResets } from '../tailwindcss-v4/skyline-typography'
import { collectRootScopedComparableCssCoverage, isRuleCoveredByRootCss } from './coverage'
import { normalizeCssSignatureValue } from './predicates'

export function removeCssRulesCoveredBySources(
  css: string,
  sources: string[],
  options: { exactOnly?: boolean | undefined, preserveSkylineTypography?: boolean | undefined } = {},
  preparedCoverage?: ComparableCssCoverage | undefined,
) {
  if (sources.length === 0 || css.trim().length === 0) {
    return css
  }
  const coverage = preparedCoverage ?? collectRootScopedComparableCssCoverage(sources)
  if (coverage.rules.size === 0 && coverage.declarationsBySelector.size === 0 && coverage.normalizedRuleCss.size === 0) {
    return css
  }
  try {
    const root = postcss.parse(css)
    let changed = false
    root.walkRules((rule) => {
      if (options.preserveSkylineTypography && isSkylineTypographyResetRule(rule)) {
        return
      }
      if (
        !coverage.normalizedRuleCss.has(normalizeCssSignatureValue(rule.toString()))
        && (options.exactOnly === true || !isRuleCoveredByRootCss(rule, coverage))
      ) {
        return
      }
      if (options.preserveSkylineTypography && retainSkylineTypographyResets(rule)) {
        changed = true
        return
      }
      removeCssRuleWithSourceTrace(rule)
      changed = true
    })
    return changed ? root.toString() : css
  }
  catch {
    return css
  }
}
