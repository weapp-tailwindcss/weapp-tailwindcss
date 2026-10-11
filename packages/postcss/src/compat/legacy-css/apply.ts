import postcss from 'postcss'

/** 删除兼容源中的 `@apply` 规则及其空包装 at-rule。 */
export function removeTailwindApplyRules(rawSource: string) {
  try {
    const root = postcss.parse(rawSource)
    let removed = false
    root.walkAtRules('apply', (rule) => {
      const parent = rule.parent
      if (parent?.type === 'rule') {
        parent.remove()
      }
      else {
        rule.remove()
      }
      removed = true
    })
    root.walkAtRules((rule) => {
      if (rule.nodes && rule.nodes.length === 0) {
        rule.remove()
      }
    })
    return removed ? root.toString() : rawSource
  }
  catch {
    return rawSource
  }
}
