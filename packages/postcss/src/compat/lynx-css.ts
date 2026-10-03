import postcssCalc from '@weapp-tailwindcss/postcss-calc'
import postcss from 'postcss'
import valueParser from 'postcss-value-parser'

const tailwindThemePropertyPatterns = [
  /^--aspect-/,
  /^--animate-/,
  /^--blur-/,
  /^--breakpoint-/,
  /^--color-/,
  /^--container-/,
  /^--drop-shadow-/,
  /^--ease-/,
  /^--default-font-/,
  /^--default-mono-font-/,
  /^--default-transition-/,
  /^--font-/,
  /^--font-weight-/,
  /^--inset-shadow-/,
  /^--leading-/,
  /^--perspective-/,
  /^--radius-/,
  /^--shadow-/,
  /^--text-/,
  /^--tracking-/,
  /^--spacing$/,
]

function isTailwindThemeProperty(property: string) {
  return tailwindThemePropertyPatterns.some(pattern => pattern.test(property))
}

const cssWideKeywords = new Set(['initial', 'inherit', 'unset', 'revert', 'revert-layer'])

function isThemeScopeSelector(selector: string) {
  return postcss.list.comma(selector).every((part) => {
    const normalized = part.trim()
    return normalized === ':root' || normalized === ':host'
  })
}

function collectTailwindThemeProperties(root: postcss.Root) {
  const values = new Map<string, string>()
  const dynamic = new Set<string>()
  root.walkDecls((decl) => {
    if (!isTailwindThemeProperty(decl.prop)) {
      return
    }
    const rule = decl.parent
    const value = decl.value.trim()
    // 只静态化顶层纯 theme 声明；局部、条件和优先级覆写交给原生变量语义。
    if (rule?.type !== 'rule' || rule.parent !== root || !isThemeScopeSelector(rule.selector)
      || decl.important || cssWideKeywords.has(value.toLowerCase())
      || (values.has(decl.prop) && values.get(decl.prop) !== value)) {
      dynamic.add(decl.prop)
    }
    else {
      values.set(decl.prop, value)
    }
  })
  for (const property of dynamic) {
    values.delete(property)
  }
  // 无法完全解析的别名可能依赖动态变量或循环引用，不能删除其定义。
  const stableValues = new Map<string, string>()
  for (const [property, value] of values) {
    const resolved = resolveThemeValue(value, values, new Set([property]))
    if (!resolved.includes('var(')) {
      stableValues.set(property, resolved)
    }
  }
  return stableValues
}

function resolveThemeValue(
  value: string,
  properties: ReadonlyMap<string, string>,
  resolving: ReadonlySet<string> = new Set(),
): string {
  if (!value.includes('var(')) {
    return value
  }

  const parsed = valueParser(value)
  parsed.walk((node) => {
    if (node.type !== 'function' || node.value.toLowerCase() !== 'var') {
      return
    }
    const propertyNode = node.nodes.find(child => child.type === 'word' && child.value.startsWith('--'))
    const property = propertyNode?.value
    if (!property || resolving.has(property)) {
      return
    }
    const propertyValue = properties.get(property)
    if (!propertyValue) {
      return
    }
    const nextResolving = new Set(resolving)
    nextResolving.add(property)
    const resolved = resolveThemeValue(propertyValue, properties, nextResolving)
    const mutableNode = node as any
    mutableNode.type = 'word'
    mutableNode.value = resolved
    delete mutableNode.nodes
  })
  return parsed.toString()
}

function removeConsumedThemeProperties(root: postcss.Root, properties: ReadonlyMap<string, string>) {
  root.walkRules((rule) => {
    if (!isThemeScopeSelector(rule.selector)) {
      return
    }
    rule.walkDecls((decl) => {
      if (properties.has(decl.prop)) {
        decl.remove()
      }
    })
    if (rule.nodes.length === 0) {
      rule.remove()
    }
  })
}

function normalizeTailwindDefaultSelectors(root: postcss.Root) {
  root.walkRules((rule) => {
    const selectors = rule.selectors
    const canonical = new Set(selectors.map(selector => selector.replace(/^::?(before|after)$/, '::$1')))
    if (selectors.length !== 4 || canonical.size !== 4
      || !['*', '::before', '::after', '::backdrop'].every(selector => canonical.has(selector))) {
      return
    }
    const declarations = rule.nodes.filter(node => node.type !== 'comment')
    if (declarations.length === 0 || !declarations.every(node => node.type === 'decl' && node.prop.startsWith('--tw-'))) {
      return
    }
    // ::backdrop 会让 encoder 丢弃整组；其余三个选择器可承载 Tailwind 默认变量。
    rule.selectors = selectors.filter(selector => selector !== '::backdrop')
  })
}

/** 保留 Lynx 的 Tailwind 默认变量，并静态化可证明稳定的 theme 值。 */
export function transformLynxCssCompat(css: string) {
  try {
    const root = postcss.parse(css)
    normalizeTailwindDefaultSelectors(root)
    const properties = collectTailwindThemeProperties(root)
    if (properties.size === 0) {
      return root.toString()
    }

    root.walkDecls((decl) => {
      decl.value = resolveThemeValue(decl.value, properties)
    })
    removeConsumedThemeProperties(root, properties)
    postcss([postcssCalc()]).process(root, { from: undefined }).sync()
    return root.toString()
  }
  catch {
    return css
  }
}
