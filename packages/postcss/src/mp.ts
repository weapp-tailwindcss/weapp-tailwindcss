// 小程序端预处理逻辑，负责变量注入与选择器修正
import type { IStyleHandlerOptions } from './types'
import { Declaration, Rule } from 'postcss'
import { collectUsedTailwindcssV4Variables, createUsedCssVarsV4Nodes, isTailwindcssV4, testIfRootHostForV4, usesTailwindcssV4ContentVariable } from './compat/tailwindcss-v4'
import { isUniAppXEnabled } from './compat/uni-app-x'
import { isOnlyBeforeAndAfterPseudoElement } from './selectorParser'
import { appendRuleSelector, assignRuleSelectors } from './utils/selector-guard'
import { hasTwVars } from './utils/tw-vars'

const DEFAULT_ROOT_SELECTORS = ['page', '.tw-root', 'wx-root-portal-content'] as const

export interface PreflightContentUsage {
  read: () => boolean
  invalidate: () => void
}

// ':not(template) ~ :not(template)'
// ':not(template)~:not(template)'
// const regexp1 = /:not\(template\)\s*~\s*:not\(template\)/g
// :not([hidden])~:not([hidden])
// :not([hidden]) ~ :not([hidden])
// const regexp2 = /:not\(\[hidden\]\)\s*~\s*:not\(\[hidden\]\)/g

/**
 * 带有子选择器的
 * 参考：https://tailwindcss.com/docs/space
 * .space-x-4>:not([hidden])~:not([hidden])
 *
 * 参考：https://tailwindcss.com/docs/divide-width
 * .divide-x>:not([hidden])~:not([hidden])
 *
 * 参考：https://tailwindcss.com/docs/divide-color
 * .divide-blue-200>:not([hidden])~:not([hidden])
 * :is(.dark .dark\:divide-slate-700)>:not([hidden])~:not([hidden])
 *
 * 参考：https://tailwindcss.com/docs/divide-style
 * .divide-dashed>:not([hidden])~:not([hidden])
 *
 * 其中小程序里直接写
 * .divide-y-4>:not(hidden) + :not(hidden)
 * 会语法错误
 */

// 判断当前规则是否仅包含 before/after 的变量声明，用于标记变量作用域
export function testIfVariablesScope(node: Rule, count = 2): boolean {
  // 普通声明不可能成为变量作用域，先检查声明再承担选择器 AST 的解析成本。
  return hasTwVars(node, count) && isOnlyBeforeAndAfterPseudoElement(node)
}

// Tailwind backdrop 相关规则也需要被视为变量作用域
export function testIfTwBackdrop(node: Rule, count = 2) {
  if (node.type === 'rule' && node.selector === '::backdrop') {
    return hasTwVars(node, count)
  }
  return false
}

// 构造 ::before/::after 的占位规则，为变量注入腾出空间
export function makePseudoVarRule() {
  const pseudoVarRule = new Rule({
    // selectors: ['::before', '::after'],
    selector: '::before,::after',
  })
  pseudoVarRule.append(
    new Declaration({
      prop: '--tw-content',
      value: '""',
    }),
  )
  return pseudoVarRule
}

function isEmptyContentInitDeclaration(decl: Declaration) {
  return decl.prop === '--tw-content' && (decl.value === '""' || decl.value === '\'\'')
}

function removeTailwindV4EmptyContentInit(node: Rule) {
  node.walkDecls((decl) => {
    if (isEmptyContentInitDeclaration(decl)) {
      decl.remove()
    }
  })
}

function injectPreflightDeclarations(node: Rule, options: IStyleHandlerOptions, contentUsage?: PreflightContentUsage) {
  const preflightDeclarations = options.cssInjectPreflight?.()
  if (!preflightDeclarations || preflightDeclarations.length === 0) {
    return
  }
  node.prepend(...preflightDeclarations)
  node.raws.semicolon = true
  // 注入回调也可能修改已有节点，后续规则必须重新查询当前 Root。
  contentUsage?.invalidate()
}

function hasClassSelector(selectors: string[]) {
  return selectors.some(selector => selector.includes('.'))
}

function isRootThemeScopeRule(selectors: string[]) {
  return selectors.length > 0
    && selectors.every(selector => selector === ':root' || selector === ':host' || DEFAULT_ROOT_SELECTORS.includes(selector as typeof DEFAULT_ROOT_SELECTORS[number]))
}

// 根据配置补全变量作用域的选择器（例如 * 或 :not(not)）
export function remakeCssVarSelector(selectors: string[], options: IStyleHandlerOptions) {
  const { cssPreflightRange, cssSelectorReplacement } = options
  if (
    cssPreflightRange === 'all' // 默认对每个元素都生效
    && !selectors.includes(':not(not)')
  ) {
    selectors.push(':not(not)')
  }
  if (cssSelectorReplacement) {
    if (Array.isArray(cssSelectorReplacement.universal)) {
      if (
        !cssSelectorReplacement.universal.every((x) => {
          return selectors.includes(x)
        })
        && !selectors.includes('*')
      ) {
        selectors.unshift('*')
      }
    }
    else if (
      typeof cssSelectorReplacement.universal === 'string'
      && !selectors.includes(cssSelectorReplacement.universal)
      && !selectors.includes('*')
    ) {
      selectors.unshift('*')
    }
  }

  return selectors
}

function resolveUniAppXVariableScopeSelectors(options: IStyleHandlerOptions) {
  const universal = options.cssSelectorReplacement?.universal
  if (Array.isArray(universal) && universal.length > 0) {
    return [...universal]
  }
  if (typeof universal === 'string' && universal.length > 0) {
    return [universal]
  }
  return ['view', 'text']
}

// 在通用预处理节点中注入变量、预设声明，并标记上下文状态
export function commonChunkPreflight(
  node: Rule,
  options: IStyleHandlerOptions,
  contentUsage?: PreflightContentUsage,
) {
  const { ctx, injectAdditionalCssVarScope } = options
  const uniAppXEnabled = isUniAppXEnabled(options)
  const isTailwindcss4 = isTailwindcssV4(options)
  const rootOption = options.cssSelectorReplacement?.root
  const rootSelectors = rootOption === false || rootOption === undefined
    ? []
    : Array.isArray(rootOption)
      ? rootOption.filter(Boolean)
      : [rootOption]
  // PostCSS 的 selectors getter 每次都会重新拆分字符串；仅在本次选择器变更后刷新。
  let selectors = node.selectors
  const hasHostSelector = selectors.some(selector => selector.includes(':host'))
  const hasRootPseudoSelector = selectors.some(selector => selector.includes(':root'))
  const hasAllDefaultRootSelectors = DEFAULT_ROOT_SELECTORS.every(selector => selectors.includes(selector))
  if (
    !hasHostSelector
    && !rootSelectors.includes(':host')
    && (
      hasRootPseudoSelector
      || (
        rootSelectors.length === DEFAULT_ROOT_SELECTORS.length
        && rootSelectors.every((selector, index) => selector === DEFAULT_ROOT_SELECTORS[index])
        && hasAllDefaultRootSelectors
      )
    )
  ) {
    appendRuleSelector(node, ':host', {
      phase: 'pre',
      reason: 'append-host-selector',
    })
    selectors = node.selectors
  }
  // 标记 CSS 变量作用域
  // node.selector = remakeCombinatorSelector(node.selector, options)
  if (isTailwindcss4 && (!hasClassSelector(selectors) || isRootThemeScopeRule(selectors))) {
    const rootUsesContentVariable = contentUsage?.read()
      ?? usesTailwindcssV4ContentVariable(node.root())
    if (!rootUsesContentVariable) {
      removeTailwindV4EmptyContentInit(node)
    }
  }
  // 变量注入和 preflight
  if (
    testIfVariablesScope(node)
    || (uniAppXEnabled && selectors.includes('*') && hasTwVars(node, 2))
  ) {
    ctx?.markVariablesScope(node)
    assignRuleSelectors(node, uniAppXEnabled
      ? resolveUniAppXVariableScopeSelectors(options)
      : remakeCssVarSelector(selectors, options), {
      phase: 'pre',
      reason: 'rewrite-variable-scope',
    })
    injectPreflightDeclarations(node, options, contentUsage)
  }
  if (injectAdditionalCssVarScope && isTailwindcss4 && testIfRootHostForV4(node)) {
    const nodes = createUsedCssVarsV4Nodes(collectUsedTailwindcssV4Variables(node.root()))
    if (nodes.length === 0) {
      return
    }
    const syntheticRule = new Rule({
      selectors: uniAppXEnabled ? resolveUniAppXVariableScopeSelectors(options) : ['*', '::after', '::before'],
      nodes,
    })
    if (!uniAppXEnabled) {
      assignRuleSelectors(syntheticRule, remakeCssVarSelector(syntheticRule.selectors, options), {
        phase: 'pre',
        reason: 'rewrite-synthetic-variable-scope',
      })
    }
    node.before(syntheticRule)
    contentUsage?.invalidate()
    injectPreflightDeclarations(syntheticRule, options, contentUsage)
  }
}
