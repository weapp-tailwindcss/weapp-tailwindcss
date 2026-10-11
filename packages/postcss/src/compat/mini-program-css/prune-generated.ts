import type { ApplyConfiguredCssCalcOptions } from '../../plugins/applyConfiguredCssCalc'
import type { IStyleHandlerOptions } from '../../types'
import postcss from 'postcss'
import { normalizeMiniProgramPrefixedDeclaration, removeUnsupportedMiniProgramPrefixedAtRule } from '../mini-program-prefixes'
import { removeUnsupportedCascadeLayers } from './at-rules'
import {
  isBrowserElementPreflightRule,
  isCustomPropertyRule,
  isEmptyTwContentDeclaration,
  isMiniProgramPreflightRule,
  isMiniProgramThemeVariableRule,
  isPseudoContentInitRule,
  usesTwContentVariable,
} from './predicates'
import { removeSpecificityPlaceholders, removeTailwindContainerMaxWidthMediaRules, removeTailwindContainerWidthRules, removeUnsupportedModernColorDeclarations } from './root-cleanups'
import { getRuleSelectors, isMiniProgramNativeElementSelector, isUnsupportedBrowserPreflightSelector, MINI_PROGRAM_ELEMENT_SCOPE_SELECTOR, MINI_PROGRAM_ELEMENT_SCOPE_SELECTORS } from './selectors'

const DEFAULT_WEAPP_VARIABLE_SCOPE = 'page,.tw-root,wx-root-portal-content,:host'
const MINI_PROGRAM_PSEUDO_CONTENT_SCOPE_SELECTOR = '::before,\n::after'
const CLASS_SELECTOR_RE = /(?:^|[^\w-])\.[_a-z\u00A0-\uFFFF\\-]/i

export interface PruneMiniProgramGeneratedCssOptions extends Pick<ApplyConfiguredCssCalcOptions, 'cssCalc' | 'cssOptions' | 'customPropertyValues' | 'customPropertyContextCss' | 'contextCss'>, Pick<IStyleHandlerOptions, 'cssSelectorReplacement'> {
  preserveContentInit?: boolean
  preservePreflight?: boolean
  preserveConditionalComments?: boolean
  preserveRawClassRules?: boolean
}

function isConditionalCompilationComment(text: string) {
  return /#(?:ifn?def|endif)\b/.test(text)
}

function hasClassSelector(selector: string) {
  return CLASS_SELECTOR_RE.test(selector)
}

function hasClassRuleAncestor(rule: postcss.Rule) {
  let parent = rule.parent
  while (parent) {
    if (parent.type === 'rule' && hasClassSelector(parent.selector)) {
      return true
    }
    parent = parent.parent
  }
  return false
}

function removeEmptyContentInitDeclarations(rule: postcss.Rule) {
  rule.walkDecls((decl) => {
    if (isEmptyTwContentDeclaration(decl)) {
      decl.remove()
    }
  })
}

function isMiniProgramElementVariableScopeRule(rule: postcss.Rule) {
  const selectors = getRuleSelectors(rule)
  return selectors.length > 0
    && selectors.every(selector => MINI_PROGRAM_ELEMENT_SCOPE_SELECTORS.has(selector))
}

function isMiniProgramNativeElementRule(rule: postcss.Rule) {
  const selectors = getRuleSelectors(rule)
  return selectors.length > 0
    && selectors.every(selector => isMiniProgramNativeElementSelector(selector))
    && !isMiniProgramPreflightRule(rule)
}

function isOnlyTwContentDeclarations(rule: postcss.Rule) {
  let hasDeclaration = false
  let onlyContentVariable = true
  rule.walkDecls((decl) => {
    hasDeclaration = true
    if (decl.prop !== '--tw-content') {
      onlyContentVariable = false
    }
  })
  return hasDeclaration && onlyContentVariable
}

function isMiniProgramElementContentInitRule(rule: postcss.Rule) {
  if (!isMiniProgramElementVariableScopeRule(rule)) {
    return false
  }
  let hasElementSelector = false
  let hasPseudoSelector = false
  for (const selector of getRuleSelectors(rule)) {
    if (selector === 'view' || selector === 'text') {
      hasElementSelector = true
    }
    else if (selector === '::before' || selector === '::after') {
      hasPseudoSelector = true
    }
  }
  return hasElementSelector && hasPseudoSelector && isOnlyTwContentDeclarations(rule)
}

function hasMiniProgramElementContentInit(root: postcss.Root) {
  let found = false
  root.walkRules((rule) => {
    if (!isMiniProgramElementVariableScopeRule(rule)) {
      return
    }
    rule.walkDecls('--tw-content', (decl) => {
      if (isEmptyTwContentDeclaration(decl)) {
        found = true
      }
    })
  })
  return found
}

function ensureMiniProgramElementContentInit(root: postcss.Root) {
  if (hasMiniProgramElementContentInit(root)) {
    return
  }

  let defaultScopeRule: postcss.Rule | undefined
  root.walkRules((rule) => {
    if (rule.selector === MINI_PROGRAM_ELEMENT_SCOPE_SELECTOR) {
      defaultScopeRule = rule
      return false
    }
  })

  const declaration = postcss.decl({
    prop: '--tw-content',
    value: '""',
  })
  if (defaultScopeRule) {
    defaultScopeRule.append(declaration)
    return
  }

  root.prepend(postcss.rule({
    selector: MINI_PROGRAM_ELEMENT_SCOPE_SELECTOR,
    nodes: [declaration],
  }))
}

function isTailwindV4GradientRuntimeDeclaration(decl: postcss.Declaration) {
  return decl.prop.startsWith('--tw-gradient-')
}

function moveTailwindV4GradientRuntimeDeclarations(rule: postcss.Rule) {
  const gradientDeclarations: postcss.Declaration[] = []

  rule.walkDecls((decl) => {
    if (isTailwindV4GradientRuntimeDeclaration(decl)) {
      gradientDeclarations.push(decl.clone())
      decl.remove()
    }
  })

  if (gradientDeclarations.length > 0) {
    rule.before(new postcss.Rule({
      selector: MINI_PROGRAM_ELEMENT_SCOPE_SELECTOR,
      nodes: gradientDeclarations,
    }))
  }

  if (rule.nodes.length === 0) {
    rule.remove()
  }
}

function isKeyframesRule(rule: postcss.Rule) {
  let parent = rule.parent as postcss.Container | undefined
  while (parent) {
    if (parent.type === 'atrule' && (parent as postcss.AtRule).name.endsWith('keyframes')) {
      return true
    }
    parent = parent.parent as postcss.Container | undefined
  }
  return false
}

/**
 * 裁剪 Tailwind 生成 CSS 中面向浏览器的 classless 规则。
 */
export function pruneMiniProgramGeneratedCss(
  css: string,
  options: PruneMiniProgramGeneratedCssOptions = {},
) {
  return pruneMiniProgramGeneratedCssRoot(postcss.parse(css), options).toString()
}

/**
 * 原位裁剪当前管线拥有的 AST，避免序列化后重新解析整份生成样式。
 */
export function pruneMiniProgramGeneratedCssRoot(
  root: postcss.Root,
  options: PruneMiniProgramGeneratedCssOptions = {},
) {
  const shouldPreserveContentInit = options.preserveContentInit
    ?? (options.preservePreflight || usesTwContentVariable(root))

  root.walkComments((comment) => {
    if (options.preserveConditionalComments && isConditionalCompilationComment(comment.text)) {
      return
    }
    comment.remove()
  })

  removeUnsupportedCascadeLayers(root)
  removeSpecificityPlaceholders(root)
  removeUnsupportedModernColorDeclarations(root)
  removeTailwindContainerMaxWidthMediaRules(root)
  removeTailwindContainerWidthRules(root)

  root.walkAtRules('supports', (atRule) => {
    atRule.remove()
  })
  root.walkAtRules((atRule) => {
    removeUnsupportedMiniProgramPrefixedAtRule(atRule)
  })
  root.walkDecls((decl) => {
    normalizeMiniProgramPrefixedDeclaration(decl)
  })

  root.walkRules((rule) => {
    if (isKeyframesRule(rule)) {
      return
    }

    if (isPseudoContentInitRule(rule)) {
      if (!shouldPreserveContentInit) {
        rule.remove()
      }
      return
    }

    if (isMiniProgramElementContentInitRule(rule)) {
      if (!shouldPreserveContentInit) {
        rule.remove()
        return
      }
      rule.selector = MINI_PROGRAM_PSEUDO_CONTENT_SCOPE_SELECTOR
      return
    }

    if (isCustomPropertyRule(rule) && isMiniProgramElementVariableScopeRule(rule)) {
      rule.selector = MINI_PROGRAM_ELEMENT_SCOPE_SELECTOR
      return
    }

    if (options.preserveRawClassRules && (hasClassSelector(rule.selector) || hasClassRuleAncestor(rule))) {
      return
    }

    if (isUnsupportedBrowserPreflightSelector(rule.selector)) {
      rule.remove()
      return
    }

    if (isBrowserElementPreflightRule(rule)) {
      rule.remove()
      return
    }

    if (isMiniProgramNativeElementRule(rule)) {
      return
    }

    if (isMiniProgramThemeVariableRule(rule)) {
      moveTailwindV4GradientRuntimeDeclarations(rule)
      if (!rule.parent) {
        return
      }
      rule.selector = DEFAULT_WEAPP_VARIABLE_SCOPE
      return
    }

    if (hasClassSelector(rule.selector)) {
      return
    }

    if (!shouldPreserveContentInit) {
      removeEmptyContentInitDeclarations(rule)
    }

    if (isMiniProgramPreflightRule(rule)) {
      if (options.preservePreflight) {
        return
      }
      rule.remove()
      return
    }

    if (isCustomPropertyRule(rule)) {
      moveTailwindV4GradientRuntimeDeclarations(rule)
      if (!rule.parent) {
        return
      }
      rule.selector = DEFAULT_WEAPP_VARIABLE_SCOPE
      return
    }

    rule.remove()
  })

  if (shouldPreserveContentInit) {
    ensureMiniProgramElementContentInit(root)
  }

  root.walkAtRules((atRule) => {
    if (!atRule.nodes || atRule.nodes.length === 0) {
      atRule.remove()
    }
  })

  return root
}
