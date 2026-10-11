import postcss from 'postcss'

/** 按声明顺序收集构建期上下文，不推断级联或运行时作用域。 */
export function collectCustomPropertyValues(css: string) {
  const values = new Map<string, string>()
  mergeCustomPropertyValues(values, css)
  return values
}

/** 直接合并到调用方上下文，避免中间 Map；后出现的声明覆盖旧值。 */
export function mergeCustomPropertyValues(target: Map<string, string>, css: string) {
  if (!css.includes('--')) {
    return
  }
  try {
    postcss.parse(css).walkDecls((decl) => {
      if (decl.prop.startsWith('--')) {
        target.set(decl.prop, decl.value.trim())
      }
    })
  }
  catch {
    // 无法解析时不修改上下文，由正常样式管线处理语法错误。
  }
}
