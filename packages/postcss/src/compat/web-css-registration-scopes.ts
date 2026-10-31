import postcss from 'postcss'
import { getCssAtRulePrelude, isCssPropertyRegistration } from '../utils/css-custom-property'

function isScopeWrapper(node: postcss.Node | undefined): node is postcss.AtRule | postcss.Rule {
  return node?.type === 'atrule' || node?.type === 'rule'
}

/** 只隔离注册并保留原始祖先语境；同一祖先内的普通样式照常转换。 */
export function withPreservedRegistrationScopes(root: postcss.Root, transform: () => void) {
  const registrations: postcss.AtRule[] = []
  root.walkAtRules((rule) => {
    if (getCssAtRulePrelude(rule).name.toLowerCase() !== 'property' || (rule.parent && isCssPropertyRegistration(rule.parent))) {
      return
    }
    if (rule.parent !== root) {
      registrations.push(rule)
    }
  })
  const texts = new Set<string>()
  root.walkComments((comment) => {
    texts.add(comment.text)
  })
  const placeholders = registrations.map((registration, index) => {
    let text = `weapp-tailwindcss registration scope ${index}`
    while (texts.has(text)) {
      text += '_'
    }
    texts.add(text)
    let scope: postcss.ChildNode = registration.clone()
    let ancestor: postcss.Node['parent'] = registration.parent
    while (isScopeWrapper(ancestor)) {
      const wrapper = ancestor.clone().removeAll()
      wrapper.append(scope)
      scope = wrapper
      ancestor = ancestor.parent
    }
    registration.replaceWith(postcss.comment({ text }))
    return { scope, text }
  })
  let restoreError: Error | undefined
  try {
    transform()
  }
  finally {
    for (const { scope, text } of placeholders) {
      const markers: postcss.Comment[] = []
      root.walkComments((comment) => {
        if (comment.text === text) {
          markers.push(comment)
        }
      })
      if (markers.length !== 1) {
        // 标记丢失或被复制时无法证明注册次序；外层保留本次完整原始 CSS。
        restoreError = new Error('无法保留注册的原始条件语境')
        continue
      }
      for (const marker of markers) {
        let anchor: postcss.ChildNode = marker
        while (isScopeWrapper(anchor.parent)) {
          anchor = anchor.parent
        }
        root.insertBefore(anchor, scope.clone())
        let parent: postcss.Node['parent'] = marker.parent
        marker.remove()
        while (parent && parent !== root && parent.nodes?.length === 0) {
          const next: postcss.Node['parent'] = parent.parent
          parent.remove()
          parent = next
        }
      }
    }
  }
  if (restoreError) {
    throw restoreError
  }
}
