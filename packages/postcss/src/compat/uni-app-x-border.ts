import type { CssPreflightOptions } from '../types'
import postcss from 'postcss'
import { createInjectPreflight } from '../preflight'

export const UNI_APP_X_BORDER_PREFLIGHT_CLASS = 'weapp-tw-border'

/** 框架回放组件样式后恢复基础规则的顺序，确保作者 class 可以覆盖重置。 */
export function hoistUniAppXBorderPreflight(css: string) {
  if (!css.includes(UNI_APP_X_BORDER_PREFLIGHT_CLASS)) {
    return css
  }
  const root = postcss.parse(css)
  const resets = root.nodes.filter(node => node.type === 'rule' && node.selector === `.${UNI_APP_X_BORDER_PREFLIGHT_CLASS}`)
  const anchor = root.nodes.find(node => !resets.includes(node)
    && node.type !== 'comment'
    && !(node.type === 'atrule' && ['charset', 'import'].includes(node.name)))
  if (!anchor || resets.length === 0) {
    return css
  }
  for (const reset of resets) {
    reset.remove()
    root.insertBefore(anchor, reset)
  }
  return root.toString()
}

/** uni-app x 移除通配符 preflight 后，用独立基础类承载用户配置的边框默认值。 */
export function createUniAppXBorderPreflight(options?: CssPreflightOptions) {
  const declarations = createInjectPreflight(options)()
    .filter(({ prop }) => prop === 'border' || prop.startsWith('border-'))
  if (declarations.length === 0) {
    return undefined
  }
  const rule = postcss.rule({ selector: `.${UNI_APP_X_BORDER_PREFLIGHT_CLASS}` })
  for (const declaration of declarations) {
    rule.append(postcss.decl(declaration))
  }
  return rule.toString()
}
