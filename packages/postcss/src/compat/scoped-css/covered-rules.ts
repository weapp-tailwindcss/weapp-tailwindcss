import type { ComparableCssCoverage } from './coverage'
import postcss from 'postcss'
import { removeCssRuleWithSourceTrace } from '../../utils/css-source-trace'
import { isSkylineTypographyResetRule, retainSkylineTypographyResets } from '../tailwindcss-v4/skyline-typography'
import { collectRootScopedComparableCssCoverage, createRootCssCoverageSignatures, isRuleCoveredByRootCss } from './coverage'

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
    const signatures = createRootCssCoverageSignatures(coverage)
    const root = postcss.parse(css)
    let changed = false
    root.walkRules((rule) => {
      if (options.preserveSkylineTypography && isSkylineTypographyResetRule(rule)) {
        return
      }
      if (
        !(coverage.normalizedRuleCss.size > 0 && coverage.normalizedRuleCss.has(signatures.node(rule)))
        && (options.exactOnly === true || !isRuleCoveredByRootCss(rule, coverage, signatures))
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
