import type { NativeSelectorRuleTransformer } from '../native/binding'
import type { IStyleHandlerOptions } from '../types'
import { loadNativeCssBinding, nativeCssConfigured } from '../native/binding'
import { resolveCssEscapeMap } from '../utils/escape-map'

/** 接收公共规则入口的配置快照，后续每条规则只传选择器和接收规则动作。 */
export function createNativeSelectorRuleTransformer(options: IStyleHandlerOptions, root?: string, universal?: string) {
  if (!nativeCssConfigured) {
    return (_selector: string) => undefined
  }
  let transformer: NativeSelectorRuleTransformer | undefined
  return (selector: string) => {
    if (resolveCssEscapeMap(options.escapeMap)) {
      return undefined
    }
    const binding = loadNativeCssBinding()
    if (!binding) {
      return undefined
    }
    if (!transformer) {
      const child = options.cssChildCombinatorReplaceValue
      transformer = new binding.SelectorRuleTransformer({
        root,
        universal,
        child: typeof child === 'string' ? [child] : child?.length ? child : ['view'],
        removeHover: Boolean(options.cssRemoveHoverPseudoClass),
        removeActive: Boolean(options.cssRemoveActivePseudoClass),
        removeFocus: Boolean(options.cssRemoveFocusPseudoClass),
        uniAppX: Boolean(options.uniAppX),
      })
    }
    return transformer.transform(selector) ?? undefined
  }
}
