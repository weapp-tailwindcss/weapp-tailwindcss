import type { Node, Selector } from 'postcss-selector-parser'
import type { TransformContext } from './types'
import { stripUnsupportedNodeForUniAppX } from '../../compat/uni-app-x'
import { internalCssSelectorReplacer } from '../../shared'
import { transformSpacingSelector } from '../spacing'
import { getCombinatorSelectorAst } from '../utils'
import { shouldRemoveUnsupportedPseudoElementSelector } from './pseudos'
import { getUnsupportedPseudoClassSet, removeUnsupportedPseudoSelector } from './unsupported-pseudos'

export function handleClassNode(node: Node, context: TransformContext) {
  if (node.type !== 'class') {
    return
  }
  node.value = context.classReplacements?.get(node.value)
    ?? internalCssSelectorReplacer(node.value, context.selectorReplacerOptions)
}

export function handleUniversalNode(node: Node, context: TransformContext) {
  if (node.type !== 'universal') {
    return
  }
  if (context.universalReplacement) {
    node.value = context.universalReplacement
  }
}

function isHiddenOrTemplateNotPseudo(node?: Node | null) {
  if (!node || node.type !== 'pseudo' || node.value !== ':not') {
    return false
  }

  const selector = node.first
  if (!selector || selector.type !== 'selector') {
    return false
  }

  const first = selector.first
  if (!first) {
    return false
  }

  if (first.type === 'attribute') {
    return first.attribute === 'hidden'
  }

  if (first.type === 'tag') {
    return first.value === 'template'
  }

  return false
}

export function handleCombinatorNode(node: Node, index: number, context: TransformContext) {
  if (node.type !== 'combinator' || node.value !== '>') {
    return
  }

  const nodes = node.parent?.nodes
  if (!nodes) {
    return
  }

  const first = nodes[index + 1]
  const second = nodes[index + 2]
  const third = nodes[index + 3]

  if (
    isHiddenOrTemplateNotPseudo(first)
    && second
    && second.type === 'combinator'
    && (second.value === '~' || second.value === '+')
    && isHiddenOrTemplateNotPseudo(third)
  ) {
    const ast = getCombinatorSelectorAst(context.options)
    nodes.splice(index + 1, 3, ...ast)
  }
}

export function handleTagOrAttribute(node: Node, context: TransformContext) {
  stripUnsupportedNodeForUniAppX(node, context.options)
}

export function handleSelectorNode(selector: Selector, context: TransformContext) {
  if (shouldRemoveUnsupportedPseudoElementSelector(selector, context.options)) {
    selector.remove()
    return
  }

  const unsupportedPseudoClasses = context.unsupportedPseudoClasses ?? getUnsupportedPseudoClassSet(context.options)
  const unsupportedPseudo = selector.nodes.find(node => node.type === 'pseudo' && unsupportedPseudoClasses.has(node.value))
  if (unsupportedPseudo) {
    removeUnsupportedPseudoSelector(unsupportedPseudo, context.options, unsupportedPseudoClasses)
    return
  }

  if (transformSpacingSelector(selector.nodes, context.options)) {
    context.requiresSpacingNormalization = true
  }
}
