import type { Root } from 'postcss'
import selectorParser from 'postcss-selector-parser'

/** 将已有类约束上的 class 存在条件等价改写为重复类，保留框架提权语义。 */
export function normalizeClassPresenceSelectors(root: Root) {
  let changed = false
  root.walkRules((rule) => {
    if (!rule.selector.includes('[')) {
      return
    }
    let ruleChanged = false
    const next = selectorParser((selectors) => {
      selectors.walkAttributes((attribute) => {
        if (attribute.attribute !== 'class' || attribute.operator || attribute.namespace !== undefined) {
          return
        }
        const siblings = attribute.parent?.nodes ?? []
        const index = siblings.indexOf(attribute)
        let start = index
        let end = index
        while (start > 0 && siblings[start - 1].type !== 'combinator') {
          start--
        }
        while (end + 1 < siblings.length && siblings[end + 1].type !== 'combinator') {
          end++
        }
        const classNode = siblings.slice(start, end + 1).find(node => node.type === 'class')
        if (classNode) {
          attribute.replaceWith(classNode.clone({ spaces: attribute.spaces }))
          ruleChanged = true
        }
      })
    }).processSync(rule.selector)
    if (ruleChanged) {
      rule.selector = next
      changed = true
    }
  })
  return changed
}
