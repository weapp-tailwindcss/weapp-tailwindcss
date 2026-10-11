import postcss from 'postcss'

function themeScope(rule) {
  const selectors = rule.selector.replace(/\s/g, '').split(',').sort()
  if (!selectors.length || selectors.some(selector => ![':root', ':host'].includes(selector))) return
  const layers = []
  for (let parent = rule.parent; parent.type !== 'root'; parent = parent.parent) {
    // 不跨条件、匿名层或作用域证明覆盖关系；仅接受同一具名级联层。
    if (parent.type !== 'atrule' || parent.name !== 'layer' || !/^[\w.-]+$/.test(parent.params)) return
    layers.unshift(parent.params)
  }
  return JSON.stringify([layers, selectors])
}

// 探针要求目标支持标准 flex；仅去掉在同一规则内必然被后续标准声明覆盖的旧前缀。
// 返回值只用于语义比较，不写回源码或构建产物。
export function comparableCss(css) {
  const root = postcss.parse(css)
  root.walkDecls('display', (declaration) => {
    const standard = { '-webkit-flex': 'flex', '-webkit-inline-flex': 'inline-flex' }[declaration.value]
    if (!standard) return
    const siblings = declaration.parent.nodes
    const overridden = siblings.slice(siblings.indexOf(declaration) + 1).some(node => node.type === 'decl'
      && node.prop === 'display' && node.value === standard && Boolean(node.important) === Boolean(declaration.important))
    if (overridden) declaration.remove()
  })
  const themeDeclarations = new Map()
  root.walkRules((rule) => {
    const scope = themeScope(rule)
    if (!scope) return
    for (const declaration of [...rule.nodes]) {
      if (declaration.type !== 'decl' || !declaration.prop.startsWith('--')) continue
      const key = JSON.stringify([scope, declaration.prop, Boolean(declaration.important)])
      // 等价根选择器、相同层与优先级的后续变量声明必然覆盖旧值；原始证据仍独立保存。
      themeDeclarations.get(key)?.remove()
      themeDeclarations.set(key, declaration)
    }
  })
  return root.toString()
}
