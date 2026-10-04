import type { IStyleHandlerOptions } from '../../types'
import { resolveCssEscapeMap } from '../../utils/escape-map'

function sameReplacement(current: string | string[] | undefined, previous: string | string[] | undefined) {
  if (Array.isArray(current)) {
    return Array.isArray(previous)
      && current.length === previous.length
      && current.every((value, index) => value === previous[index])
  }
  return current === previous
}

function copyReplacement(value: string | string[] | undefined) {
  return Array.isArray(value) ? [...value] : value
}

/** 统一 JS、原生实例与 selector 结果缓存的配置生命周期，数组和 map 按内容比较。 */
export function resolveSelectorTransformOptions(options: IStyleHandlerOptions, previous?: IStyleHandlerOptions): IStyleHandlerOptions {
  const escapeMap = resolveCssEscapeMap(options.escapeMap)
  if (previous
    && escapeMap === previous.escapeMap
    && sameReplacement(options.cssSelectorReplacement?.root, previous.cssSelectorReplacement?.root)
    && sameReplacement(options.cssSelectorReplacement?.universal, previous.cssSelectorReplacement?.universal)
    && sameReplacement(options.cssChildCombinatorReplaceValue, previous.cssChildCombinatorReplaceValue)
    && Boolean(options.cssRemoveHoverPseudoClass) === Boolean(previous.cssRemoveHoverPseudoClass)
    && Boolean(options.cssRemoveActivePseudoClass) === Boolean(previous.cssRemoveActivePseudoClass)
    && Boolean(options.cssRemoveFocusPseudoClass) === Boolean(previous.cssRemoveFocusPseudoClass)
    && Boolean(options.uniAppX) === Boolean(previous.uniAppX)) {
    return previous
  }

  const snapshot = { ...options }
  if (escapeMap) {
    snapshot.escapeMap = escapeMap
  }
  else {
    delete snapshot.escapeMap
  }
  if (options.cssSelectorReplacement) {
    snapshot.cssSelectorReplacement = {
      ...options.cssSelectorReplacement,
      root: copyReplacement(options.cssSelectorReplacement.root),
      universal: copyReplacement(options.cssSelectorReplacement.universal),
    }
  }
  if (options.cssChildCombinatorReplaceValue !== undefined) {
    snapshot.cssChildCombinatorReplaceValue = copyReplacement(options.cssChildCombinatorReplaceValue)
  }
  return snapshot
}
