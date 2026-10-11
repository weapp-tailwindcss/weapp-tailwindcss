import type { FinalizeMiniProgramCssOptions } from './finalize-options'
import postcss from 'postcss'
import { normalizeMiniProgramPrefixedDeclaration, removeUnsupportedMiniProgramPrefixedAtRule } from '../mini-program-prefixes'
import { appendTailwindcssV4MiniProgramGradientRules, collectUsedTailwindcssV4Variables, createMissingCssVarsV4Nodes, mergeTailwindcssV4GradientDirectionRules, normalizeTailwindcssV4Declaration } from '../tailwindcss-v4'
import { removeUnsupportedCascadeLayers, removeUnsupportedMiniProgramAtRules, removeUnsupportedMiniProgramAtRulesRoot } from './at-rules'
import {
  hasTailwindcssV4Signal,
  removeTailwindGenerationDirectives,
  repairTrailingUnclosedTailwindSourceMedia,
  TAILWIND_V4_BANNER_RE,
  unwrapTailwindSourceMedia,
} from './directives'
import { createHoistInsertionAnchor, insertHoistedRules, mergeEquivalentHoistedRules } from './hoist'
import { collectPreflightRules, createPreflightResetRule } from './preflight'
import {
  removeDisplayP3Declarations,
  removeEmptyAtRules,
  removeEmptyRules,
  removeEmptyStandardDeclarations,
  removeRootSpecificityPlaceholders,
  removeSpecificityPlaceholders,
  removeSpecificityPlaceholdersFromSource,
  removeTailwindContainerMaxWidthMediaRules,
  removeTailwindContainerWidthRules,
  removeUnsupportedBrowserSelectors,
  removeUnsupportedModernColorDeclarations,
} from './root-cleanups'
import { MINI_PROGRAM_ELEMENT_SCOPE_SELECTOR } from './selectors'
import { collectThemeVariableRule } from './theme'

export type { FinalizeMiniProgramCssOptions } from './finalize-options'
export { insertHoistedRules } from './hoist'
export { collectPreflightRules } from './preflight'

export function finalizeMiniProgramCssRoot(root: postcss.Root, options: FinalizeMiniProgramCssOptions = {}) {
  const shouldInjectTailwindcssV4Defaults = options.isTailwindcssV4 === true
  const tailwindcssV4DefaultNodes = shouldInjectTailwindcssV4Defaults
    ? createMissingCssVarsV4Nodes(root, collectUsedTailwindcssV4Variables(root))
    : []
  removeUnsupportedCascadeLayers(root)
  unwrapTailwindSourceMedia(root)
  removeTailwindGenerationDirectives(root)
  root.walkAtRules('property', (atRule) => {
    atRule.remove()
  })
  root.walkAtRules('supports', (atRule) => {
    atRule.remove()
  })
  removeSpecificityPlaceholders(root)
  removeRootSpecificityPlaceholders(root)
  removeUnsupportedBrowserSelectors(root)
  removeDisplayP3Declarations(root)
  removeEmptyStandardDeclarations(root)
  removeTailwindContainerMaxWidthMediaRules(root)
  removeTailwindContainerWidthRules(root, { generatedOnly: true })
  removeUnsupportedModernColorDeclarations(root)
  root.walkDecls((decl) => {
    if (shouldInjectTailwindcssV4Defaults) {
      normalizeTailwindcssV4Declaration(decl)
    }
    normalizeMiniProgramPrefixedDeclaration(decl)
  })
  root.walkAtRules((atRule) => {
    removeUnsupportedMiniProgramPrefixedAtRule(atRule)
  })
  if (shouldInjectTailwindcssV4Defaults) {
    mergeTailwindcssV4GradientDirectionRules(root)
    if (options.tailwindcssV4GradientFallback === true) {
      appendTailwindcssV4MiniProgramGradientRules(root)
    }
  }

  const hoistAnchor = createHoistInsertionAnchor(root)
  const preflightRules = collectPreflightRules(root, options)
  if (preflightRules.length === 0) {
    const resetRule = createPreflightResetRule(options.cssPreflight)
    if (resetRule) {
      preflightRules.push(resetRule)
    }
  }
  if (tailwindcssV4DefaultNodes.length > 0) {
    preflightRules.push(postcss.rule({
      selector: MINI_PROGRAM_ELEMENT_SCOPE_SELECTOR,
      nodes: tailwindcssV4DefaultNodes,
    }))
  }
  const themeRule = collectThemeVariableRule(root, options)
  const hoistedRules = themeRule ? [...preflightRules, themeRule] : preflightRules
  insertHoistedRules(root, mergeEquivalentHoistedRules(hoistedRules), hoistAnchor)
  if (options.removeEmptyAtRuleAncestors !== false) {
    removeEmptyRules(root)
    removeEmptyAtRules(root)
  }
  else {
    root.walkAtRules((atRule) => {
      if (atRule.nodes?.length === 0) {
        atRule.remove()
      }
    })
  }
}

export function hoistTailwindPreflightBase(css: string) {
  try {
    const root = postcss.parse(css)
    const preflightRules = collectPreflightRules(root)
    insertHoistedRules(root, preflightRules)
    return root.toString()
  }
  catch {
    return css
  }
}

export function finalizeMiniProgramCss(css: string, options: FinalizeMiniProgramCssOptions = {}) {
  const repairedCss = repairTrailingUnclosedTailwindSourceMedia(css)
  let isTailwindcssV4 = options.isTailwindcssV4
  if (isTailwindcssV4 === undefined) {
    try {
      isTailwindcssV4 = hasTailwindcssV4Signal(repairedCss)
    }
    catch {
      isTailwindcssV4 = TAILWIND_V4_BANNER_RE.test(repairedCss)
    }
  }
  let root: postcss.Root
  let cleanedCss: string | undefined
  try {
    root = postcss.parse(repairedCss)
  }
  catch {
    // 无法解析的作者输入仍先尝试既有扫描修复，再执行原有兜底。
    cleanedCss = removeUnsupportedMiniProgramAtRules(repairedCss)
    try {
      root = postcss.parse(cleanedCss)
    }
    catch {
      return removeSpecificityPlaceholdersFromSource(cleanedCss)
    }
  }
  try {
    // 清理与最终转换共用同一棵 AST，避免中间打印后再次完整解析。
    removeUnsupportedMiniProgramAtRulesRoot(root)
    finalizeMiniProgramCssRoot(root, { ...options, isTailwindcssV4 })
    return root.toString()
  }
  catch {
    return removeSpecificityPlaceholdersFromSource(cleanedCss ?? removeUnsupportedMiniProgramAtRules(repairedCss))
  }
}
