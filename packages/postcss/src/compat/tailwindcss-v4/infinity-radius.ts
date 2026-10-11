import { parse } from 'postcss'
import { CLAMP_PX, INFINITY_CALC_VALUE_REGEXP } from './variables'

const BORDER_RADIUS_PROPERTY_RE = /^border-(?:radius|(?:top-left|top-right|bottom-left|bottom-right|start-start|start-end|end-start|end-end)-radius)$/i

/** 在下游 PostCSS 解析前，仅将圆角声明中的完整正无限长度收敛为有限值。 */
export function normalizeTailwindcssV4InfinityRadiusCss(css: string) {
  if (!/infinity/i.test(css)) {
    return css
  }
  const root = parse(css)
  root.walkDecls((decl) => {
    if (!BORDER_RADIUS_PROPERTY_RE.test(decl.prop) && decl.prop !== '--radius' && !decl.prop.startsWith('--radius-')) {
      return
    }
    const match = INFINITY_CALC_VALUE_REGEXP.exec(decl.value.trim())
    if (match && Number.parseFloat(match[1]!) > 0) {
      decl.value = `${CLAMP_PX}px`
    }
  })
  return root.toString()
}
