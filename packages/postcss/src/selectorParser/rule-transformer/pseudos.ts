import type { Container, Node, Pseudo, Selector } from 'postcss-selector-parser'
import type { IStyleHandlerOptions } from '../../types'
import type { TransformContext } from './types'
import { isUniAppXEnabled } from '../../compat/uni-app-x'
import { internalCssSelectorReplacer } from '../../shared'
import { transformSpacingSelector } from '../spacing'
import { getUnsupportedPseudoClassSet, removeUnsupportedPseudoSelector } from './unsupported-pseudos'

const RTL_LANGUAGE_ANY_PSEUDO_SET = new Set([
  ':-moz-any',
  ':-webkit-any',
  ':lang',
])

const EMPTY_FUNCTIONAL_PSEUDO_CLEANUP_SET = new Set([
  ':not',
  ':is',
  ':where',
  ':has',
  ':matches',
  ':-webkit-any',
  ':-moz-any',
  ':lang',
])

const EXPANDABLE_FUNCTIONAL_PSEUDO_SET = new Set([
  ':is',
  ':where',
])

const UNSUPPORTED_PSEUDO_ELEMENT_SELECTOR_SET = new Set([
  ':after',
  ':before',
  '::after',
  '::before',
  '::backdrop',
  '::-ms-backdrop',
  '::-webkit-backdrop',
  '::file-selector-button',
])

const MINI_PROGRAM_UNSUPPORTED_PSEUDO_ELEMENT_SELECTOR_SET = new Set([
  '::backdrop',
  '::-ms-backdrop',
  '::-webkit-backdrop',
  '::file-selector-button',
])

const NORMALIZED_PSEUDO_ELEMENT_SELECTOR = new Map([
  [':before', '::before'],
  [':after', '::after'],
])

function isRtlLanguageAnyPseudo(node: Node): node is Pseudo {
  return node.type === 'pseudo' && RTL_LANGUAGE_ANY_PSEUDO_SET.has(node.value)
}

function getTopLevelSelector(node: Selector): Selector {
  let current: Node = node
  let topLevel: Selector = node

  while (current.parent) {
    const parent = current.parent
    if (parent.type === 'root') {
      break
    }
    if (parent.type === 'selector') {
      topLevel = parent
    }
    current = parent
  }

  return topLevel
}

function stripUnsupportedRtlLanguagePseudo(node: Pseudo) {
  const selectorParent = node.parent
  if (!selectorParent || selectorParent.type !== 'selector') {
    return
  }

  const maybeNot = selectorParent.parent
  // Tailwind v4 会生成 :not(:-moz-any(:lang(...))) / :not(:-webkit-any(:lang(...)))
  // 这里保留主体选择器，去掉方向条件。
  if (maybeNot && maybeNot.type === 'pseudo' && maybeNot.value === ':not') {
    maybeNot.remove()
    return
  }

  // 纯 RTL 分支（如 :...any(:lang(...))）直接移除，避免微信端不支持伪类报错。
  getTopLevelSelector(selectorParent).remove()
}

export function shouldRemoveEmptyFunctionalPseudo(node: Node): node is Pseudo {
  return (
    node.type === 'pseudo'
    && EMPTY_FUNCTIONAL_PSEUDO_CLEANUP_SET.has(node.value)
    && Array.isArray(node.nodes)
    && node.nodes.length === 0
  )
}

function replaceSelectorNode(target: Selector, index: number, replacement: Selector) {
  const cloned = target.clone()
  const targetNode = cloned.nodes[index]
  if (!targetNode || targetNode.type !== 'pseudo' || targetNode.value !== ':where') {
    return undefined
  }

  targetNode.replaceWith(...replacement.nodes.map(item => item.clone()))
  return cloned
}

function getNodePath(root: Selector, target: Node) {
  const path: number[] = []
  let current: Node | undefined = target

  while (current && current !== root) {
    const parent = current.parent
    if (!parent || !('nodes' in parent) || !Array.isArray(parent.nodes)) {
      return undefined
    }

    const index = parent.nodes.indexOf(current)
    if (index < 0) {
      return undefined
    }

    path.unshift(index)
    current = parent as Node
  }

  return current === root ? path : undefined
}

function getNodeByPath(root: Selector, path: number[]) {
  let current: Node = root

  for (const index of path) {
    if (!('nodes' in current) || !Array.isArray(current.nodes)) {
      return undefined
    }

    const next = current.nodes[index]
    if (!next) {
      return undefined
    }
    current = next
  }

  return current
}

function findExpandableFunctionalPseudo(selector: Selector) {
  let target: Pseudo | undefined

  selector.walkPseudos((pseudo) => {
    if (
      !target
      && EXPANDABLE_FUNCTIONAL_PSEUDO_SET.has(pseudo.value)
      && Array.isArray(pseudo.nodes)
      && pseudo.nodes.some(item => item.type === 'selector')
    ) {
      target = pseudo
    }
  })

  return target
}

function expandNestedFunctionalPseudoBranches(selector: Selector) {
  const pending = [selector.clone()]
  const expanded: Selector[] = []

  while (pending.length > 0) {
    const current = pending.shift()
    if (!current) {
      continue
    }

    const target = findExpandableFunctionalPseudo(current)
    if (!target) {
      expanded.push(current)
      continue
    }

    const path = getNodePath(current, target)
    const branches = target.nodes.filter((item): item is Selector => item.type === 'selector')
    if (!path || branches.length === 0) {
      target.remove()
      pending.push(current)
      continue
    }

    for (const branch of branches) {
      const next = current.clone()
      const nextTarget = getNodeByPath(next, path)
      if (nextTarget?.type === 'pseudo') {
        nextTarget.replaceWith(...branch.nodes.map(item => item.clone()))
        pending.push(next)
      }
    }
  }

  return expanded
}

function transformExpandedSelectorNodes(selector: Selector, context: TransformContext) {
  selector.walk((node) => {
    if (node.type === 'class') {
      node.value = context.classReplacements?.get(node.value)
        ?? internalCssSelectorReplacer(node.value, context.selectorReplacerOptions)
    }
    else if (node.type === 'universal' && context.universalReplacement) {
      node.value = context.universalReplacement
    }
  })
}

function transformExpandedUniversalNodes(selector: Selector, context: TransformContext) {
  if (!context.universalReplacement) {
    return
  }
  selector.walk((node) => {
    if (node.type === 'universal') {
      node.value = context.universalReplacement
    }
  })
}

function appendExpandedWhereSelectors(parent: Selector, index: number, branches: Container<string, Node>[], context: TransformContext) {
  const root = parent.parent
  if (!root) {
    return false
  }

  for (const branch of branches) {
    const expanded = replaceSelectorNode(parent, index, branch as Selector)
    if (expanded) {
      transformExpandedSelectorNodes(expanded, context)
      root.insertBefore(parent, expanded)
    }
  }
  parent.remove()
  return true
}

function flattenWherePseudo(node: Pseudo, context: TransformContext, index: number, parent: Selector | undefined) {
  if (isUniAppXEnabled(context.options)) {
    node.value = ':is'
  }

  if (!parent || node.length === 0) {
    return
  }

  const branches = node.nodes
    .filter((item): item is Selector => item.type === 'selector')
    .flatMap(expandNestedFunctionalPseudoBranches)
  for (const branch of branches) {
    if (transformSpacingSelector(branch.nodes, context.options)) {
      context.requiresSpacingNormalization = true
    }
  }

  if (branches.length > 1 && appendExpandedWhereSelectors(parent, index, branches, context)) {
    return
  }

  const targetSelector = branches[0]
  if (targetSelector) {
    // 单分支展开也要应用节点级兼容转换，否则分支中的通配符会在兜底阶段被误删。
    transformExpandedUniversalNodes(targetSelector, context)
    node.replaceWith(...targetSelector.nodes.map(item => item.clone()))
  }

  if (parent.type === 'selector' && parent.length === 0) {
    parent.remove()
  }
}

export function shouldRemoveUnsupportedPseudoElementSelector(selector: Selector, options: IStyleHandlerOptions) {
  if (!isUniAppXEnabled(options)) {
    return selector.nodes.some(node =>
      node.type === 'pseudo' && MINI_PROGRAM_UNSUPPORTED_PSEUDO_ELEMENT_SELECTOR_SET.has(node.value))
  }

  return selector.nodes.some(node => node.type === 'pseudo' && UNSUPPORTED_PSEUDO_ELEMENT_SELECTOR_SET.has(node.value))
}

export function handlePseudoNode(node: Node, index: number, context: TransformContext, parent: Selector | undefined) {
  if (node.type !== 'pseudo') {
    return
  }

  if (removeUnsupportedPseudoSelector(
    node,
    context.options,
    context.unsupportedPseudoClasses ?? getUnsupportedPseudoClassSet(context.options),
  )) {
    return
  }

  if (isRtlLanguageAnyPseudo(node)) {
    stripUnsupportedRtlLanguagePseudo(node)
    return
  }

  if (node.value === ':root' && context.rootReplacement) {
    node.value = context.rootReplacement
    return
  }

  const normalizedPseudoElement = NORMALIZED_PSEUDO_ELEMENT_SELECTOR.get(node.value)
  if (normalizedPseudoElement) {
    node.value = normalizedPseudoElement
    return
  }

  if (node.value === ':where') {
    flattenWherePseudo(node, context, index, parent)
  }
}
