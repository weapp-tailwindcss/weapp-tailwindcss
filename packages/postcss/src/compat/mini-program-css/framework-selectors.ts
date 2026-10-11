import type { Root } from 'postcss'
import type { IStyleHandlerOptions } from '../../types'
import selectorParser from 'postcss-selector-parser'
import { getDefaultOptions } from '../../defaults'
import { composeIsPseudo } from '../../shared'

/**
 * 在框架过滤通配规则前完成元素兼容，保留原始 class 身份供后续转译使用。
 */
export function prepareMiniProgramFrameworkSelectors(
  root: Root,
  options: Pick<IStyleHandlerOptions, 'cssSelectorReplacement' | 'cssOptions'>,
) {
  const universal = options.cssOptions?.cssSelectorReplacement?.universal
    ?? options.cssSelectorReplacement?.universal
    ?? getDefaultOptions().cssSelectorReplacement?.universal
  if (!universal) {
    return
  }
  const replacement = composeIsPseudo(universal)
  if (!replacement) {
    return
  }
  const replacementSelectors = selectorParser().astSync(replacement)
  const replacementNodes = replacementSelectors.length > 1
    ? selectorParser().astSync(`:is(${replacement})`).first?.nodes
    : replacementSelectors.first?.nodes
  if (!replacementNodes?.length) {
    return
  }
  const parser = selectorParser((selectors) => {
    let hasClass = false
    selectors.walkClasses(() => {
      hasClass = true
    })
    // classless preflight 仍由现有裁剪与最终注入策略管理。
    if (!hasClass) {
      return
    }
    selectors.walkUniversals((node) => {
      node.replaceWith(...replacementNodes.map(replacementNode => replacementNode.clone()))
    })
  })
  const cache = new Map<string, string>()
  root.walkRules((rule) => {
    if (!rule.selector.includes('*')) {
      return
    }
    const source = rule.selector
    let selector = cache.get(source)
    if (selector === undefined) {
      selector = parser.processSync(source)
      cache.set(source, selector)
    }
    rule.selector = selector
  })
}
