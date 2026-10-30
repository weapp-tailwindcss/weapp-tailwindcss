import type { Container, Node, Selector } from 'postcss-selector-parser'
import type { IStyleHandlerOptions } from '../../types'
import selectorParser from 'postcss-selector-parser'

const UNSUPPORTED_MINI_PROGRAM_PSEUDO_CLASS_SET = new Set([
  ':autofill',
  ':checked',
  ':default',
  ':disabled',
  ':enabled',
  ':focus-visible',
  ':focus-within',
  ':fullscreen',
  ':indeterminate',
  ':in-range',
  ':invalid',
  ':modal',
  ':open',
  ':optional',
  ':out-of-range',
  ':placeholder-shown',
  ':read-only',
  ':read-write',
  ':required',
  ':target',
  ':valid',
  ':visited',
])

const unsupportedPseudoClassSetCache = new WeakMap<IStyleHandlerOptions, ReadonlySet<string>>()

export function getUnsupportedPseudoClassSet(options: IStyleHandlerOptions) {
  const cached = unsupportedPseudoClassSetCache.get(options)
  if (cached) {
    return cached
  }

  const pseudoClasses = new Set(UNSUPPORTED_MINI_PROGRAM_PSEUDO_CLASS_SET)
  if (options.cssRemoveHoverPseudoClass) {
    pseudoClasses.add(':hover')
  }
  if (options.cssRemoveActivePseudoClass) {
    pseudoClasses.add(':active')
  }
  if (options.cssRemoveFocusPseudoClass) {
    pseudoClasses.add(':focus')
  }
  unsupportedPseudoClassSetCache.set(options, pseudoClasses)
  return pseudoClasses
}

export function shouldRemoveUnsupportedPseudoClass(value: string, options: IStyleHandlerOptions) {
  return getUnsupportedPseudoClassSet(options).has(value)
}

function findRootSelector(node: Node): Selector | undefined {
  let current: Node | Container = node
  while (current.parent && current.parent.type !== 'root') {
    current = current.parent
  }
  return selectorParser.isSelector(current) ? current : undefined
}

export function removeUnsupportedPseudoSelector(
  node: Node,
  options: IStyleHandlerOptions,
  unsupportedPseudoClasses = getUnsupportedPseudoClassSet(options),
) {
  if (node.type !== 'pseudo' || !unsupportedPseudoClasses.has(node.value)) {
    return false
  }
  findRootSelector(node)?.remove()
  return true
}
