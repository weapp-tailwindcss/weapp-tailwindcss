import type { ComparableCssCoverage } from './coverage'
import postcss from 'postcss'
import { isCssSourceTraceComment, removeCssRuleWithSourceTrace } from '../../utils/css-source-trace'
import { removeUnusedMiniProgramContentInit } from '../mini-program-css'
import { hasNonCommentCss } from '../processed-css/cleanup'
import { containsSkylineTypographyReset, isSkylineTypographyResetRule, retainSkylineTypographyResets } from '../tailwindcss-v4/skyline-typography'
import { isTailwindRuntimePropertyRule } from '../uni-app-x-author-apply'
import { collectRootScopedComparableCssCoverage, createAtRuleCoverageKey, isRuleCoveredByRootCss } from './coverage'
import { hasVueScopedAttr, isLikelyTailwindGlobalRule, isLikelyTailwindLayerOrderAtRule, isLikelyTailwindPropertyAtRule, isScopedMiniProgramTailwindContentInitRule, isScopedUniAppWebTailwindPreflightRule, isScopedUniversalTailwindPreflightRule, isUnscopedMiniProgramTailwindPreflightRule, normalizeCssSignatureValue } from './predicates'

function removeScopedCssCoveredByRootStyleSources(css: string, rootSources: string[], preserveRuntimeProperties = false, preserveSkylineTypography = false) {
  if (!hasVueScopedAttr(css)) {
    return css
  }
  const hasScopedTailwindGeneratedCss = /tailwindcss v\d/i.test(css)
  const coverage = collectRootScopedComparableCssCoverage(rootSources)
  try {
    const root = postcss.parse(css)
    let changed = false
    root.walkComments((comment) => {
      if (/tailwindcss v\d/i.test(comment.text)) {
        comment.remove()
        changed = true
      }
    })
    root.walkRules((rule) => {
      if (preserveSkylineTypography && isSkylineTypographyResetRule(rule)) {
        return
      }
      if (preserveRuntimeProperties && isTailwindRuntimePropertyRule(rule)) {
        return
      }
      if (
        isRuleCoveredByRootCss(rule, coverage)
        || (
          hasScopedTailwindGeneratedCss
          && isLikelyTailwindGlobalRule(rule)
        )
        || isUnscopedMiniProgramTailwindPreflightRule(rule)
        || isScopedMiniProgramTailwindContentInitRule(rule)
        || isScopedUniAppWebTailwindPreflightRule(rule)
        || isScopedUniversalTailwindPreflightRule(rule)
      ) {
        if (preserveSkylineTypography && retainSkylineTypographyResets(rule)) {
          changed = true
          return
        }
        removeCssRuleWithSourceTrace(rule)
        changed = true
      }
    })
    root.walkAtRules((atRule) => {
      if (preserveSkylineTypography && containsSkylineTypographyReset(atRule)) {
        return
      }
      if (
        coverage.atRules.has(createAtRuleCoverageKey(atRule))
        || (!preserveRuntimeProperties && isLikelyTailwindPropertyAtRule(atRule))
        || isLikelyTailwindLayerOrderAtRule(atRule)
      ) {
        atRule.remove()
        changed = true
        return
      }
      if (atRule.nodes !== undefined && atRule.nodes.length === 0) {
        atRule.remove()
        changed = true
      }
    })
    return changed ? removeDanglingCssSourceTraceCommentsRoot(root).trim() : css
  }
  catch {
    return css
  }
}

export function removeScopedTailwindPreflightCss(css: string, options?: { preserveRuntimeProperties?: boolean, preserveSkylineTypography?: boolean }) {
  return removeScopedCssCoveredByRootStyleSources(css, [], options?.preserveRuntimeProperties, options?.preserveSkylineTypography)
}

/** 预计算索引必须对应当前 rootSources；该函数只读取索引，不保留调用方状态。 */
export function removeCssCoveredByRootStyleSources(css: string, rootSources: string[], preparedCoverage?: ComparableCssCoverage, options?: { preserveSkylineTypography?: boolean }) {
  if (css.trim().length === 0) {
    return css
  }
  const hasScopedCss = hasVueScopedAttr(css)
  const hasScopedTailwindGeneratedCss = hasScopedCss && /tailwindcss v\d/i.test(css)
  if (
    rootSources.length === 0
    && !hasScopedCss
  ) {
    return css
  }
  const coverage = preparedCoverage ?? collectRootScopedComparableCssCoverage(rootSources)
  let nextCss = css
  try {
    const root = postcss.parse(css)
    let changed = false
    root.walkRules((rule) => {
      if (options?.preserveSkylineTypography && isSkylineTypographyResetRule(rule)) {
        return
      }
      if (
        coverage.normalizedRuleCss.has(normalizeCssSignatureValue(rule.toString()))
        || (
          hasScopedCss
          && (
            isRuleCoveredByRootCss(rule, coverage)
            || (hasScopedTailwindGeneratedCss && isLikelyTailwindGlobalRule(rule))
            || isUnscopedMiniProgramTailwindPreflightRule(rule)
            || isScopedMiniProgramTailwindContentInitRule(rule)
            || isScopedUniAppWebTailwindPreflightRule(rule)
            || isScopedUniversalTailwindPreflightRule(rule)
          )
        )
      ) {
        if (options?.preserveSkylineTypography && retainSkylineTypographyResets(rule)) {
          changed = true
          return
        }
        removeCssRuleWithSourceTrace(rule)
        changed = true
      }
    })
    if (hasScopedCss) {
      root.walkAtRules((atRule) => {
        if (options?.preserveSkylineTypography && containsSkylineTypographyReset(atRule)) {
          return
        }
        if (
          coverage.atRules.has(createAtRuleCoverageKey(atRule))
          || isLikelyTailwindPropertyAtRule(atRule)
          || isLikelyTailwindLayerOrderAtRule(atRule)
        ) {
          atRule.remove()
          changed = true
          return
        }
        if (atRule.nodes !== undefined && atRule.nodes.length === 0) {
          atRule.remove()
          changed = true
        }
      })
    }
    root.walkComments((comment) => {
      if (hasScopedCss && /tailwindcss v\d/i.test(comment.text)) {
        comment.remove()
        changed = true
        return
      }
      if (!isCssSourceTraceComment(comment.text)) {
        return
      }
      if (hasCssSourceTraceHost(comment)) {
        return
      }
      comment.remove()
      changed = true
    })
    if (changed) {
      removeUnusedMiniProgramContentInit(root)
      nextCss = root.toString().trim()
    }
  }
  catch {
  }
  return hasNonCommentCss(nextCss) ? nextCss : ''
}

function removeDanglingCssSourceTraceCommentsRoot(root: postcss.Root) {
  const css = root.toString()
  if (!css.includes('tokens:')) {
    return css
  }
  let changed = false
  root.each((node) => {
    if (node.type !== 'comment' || !isCssSourceTraceComment(node.text)) {
      return
    }
    if (!hasCssSourceTraceHost(node)) {
      node.remove()
      changed = true
    }
  })
  return changed ? root.toString() : css
}

function hasCssSourceTraceHost(comment: postcss.Comment) {
  let next = comment.next()
  while (next?.type === 'comment' && isCssSourceTraceComment(next.text)) {
    next = next.next()
  }
  return next?.type === 'rule' || next?.type === 'atrule'
}
