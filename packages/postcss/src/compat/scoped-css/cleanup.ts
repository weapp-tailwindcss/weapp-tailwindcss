import type { ComparableCssCoverage } from './coverage'
import postcss from 'postcss'
import { removeUnusedMiniProgramContentInit } from '../mini-program-css'
import { hasNonCommentCss } from '../processed-css/cleanup'
import { isTailwindRuntimePropertyRule } from '../uni-app-x-author-apply'
import { collectRootScopedComparableCssCoverage, createAtRuleCoverageKey, isRuleCoveredByRootCss } from './coverage'
import { hasVueScopedAttr, isLikelyTailwindGlobalRule, isLikelyTailwindLayerOrderAtRule, isLikelyTailwindPropertyAtRule, isScopedMiniProgramTailwindContentInitRule, isScopedUniAppWebTailwindPreflightRule, isScopedUniversalTailwindPreflightRule, isUnscopedMiniProgramTailwindPreflightRule, normalizeCssSignatureValue } from './predicates'

function removeScopedCssCoveredByRootStyleSources(css: string, rootSources: string[], preserveRuntimeProperties = false) {
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
        rule.remove()
        changed = true
      }
    })
    root.walkAtRules((atRule) => {
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

export function removeScopedTailwindPreflightCss(css: string, options?: { preserveRuntimeProperties?: boolean }) {
  return removeScopedCssCoveredByRootStyleSources(css, [], options?.preserveRuntimeProperties)
}

/** 预计算索引必须对应当前 rootSources；该函数只读取索引，不保留调用方状态。 */
export function removeCssCoveredByRootStyleSources(css: string, rootSources: string[], preparedCoverage?: ComparableCssCoverage) {
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
        rule.remove()
        changed = true
      }
    })
    if (hasScopedCss) {
      root.walkAtRules((atRule) => {
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
      if (!comment.text.trim().startsWith('tokens:')) {
        return
      }
      const next = comment.next()
      if (next?.type === 'rule' || next?.type === 'atrule') {
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
  if (!css.includes('/* tokens:')) {
    return css
  }
  let changed = false
  root.each((node) => {
    if (node.type !== 'comment' || !node.text.trim().startsWith('tokens:')) {
      return
    }
    const next = node.next()
    if (next?.type !== 'rule' && next?.type !== 'atrule') {
      node.remove()
      changed = true
    }
  })
  return changed ? root.toString() : css
}
