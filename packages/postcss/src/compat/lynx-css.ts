import postcssCalc from '@weapp-tailwindcss/postcss-calc'
import postcss from 'postcss'
import valueParser from 'postcss-value-parser'
import { getCssCalcVariableReferences, getCssCustomPropertyName, isCssPropertyRegistration } from '../utils/css-custom-property'
import { collectCustomPropertyValues, resolveCustomPropertyVarValue } from './web-css-custom-properties'

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

function isThemeScopeSelector(selector: string) {
  return postcss.list.comma(selector).every((part) => {
    const normalized = part.trim()
    return normalized === ':root' || normalized === ':host'
  })
}

function collectTailwindThemeProperties(root: postcss.Root) {
  // Web 与 Lynx 使用同一套 CSS 身份、可见覆盖和完整依赖图分析。
  const { values } = collectCustomPropertyValues(root)
  return new Map([...values].filter(([property]) => isTailwindThemeProperty(property)))
}

function removeConsumedThemeProperties(root: postcss.Root, properties: ReadonlyMap<string, string>) {
  const referenced = new Set<string>()
  root.walkDecls((decl) => {
    for (const property of getCssCalcVariableReferences(decl.value).values()) {
      referenced.add(property)
    }
  })
  root.walkRules((rule) => {
    if (isCssPropertyRegistration(rule) || !isThemeScopeSelector(rule.selector)) {
      return
    }
    rule.walkDecls((decl) => {
      const property = getCssCustomPropertyName(decl.prop) ?? decl.prop
      if (properties.has(property) && !referenced.has(property)) {
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
    if (isCssPropertyRegistration(rule)) {
      return
    }
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

function normalizeThemeRootSelectors(root: postcss.Root) {
  root.walkRules((rule) => {
    if (isCssPropertyRegistration(rule)) {
      return
    }
    const selectors = rule.selectors.map(selector => selector.trim())
    if (selectors.length !== 2 || !selectors.includes(':root') || !selectors.includes(':host')) {
      return
    }
    const declarations = rule.nodes.filter(node => node.type !== 'comment')
    if (declarations.length === 0 || !declarations.every(node => node.type === 'decl' && getCssCustomPropertyName(node.prop))) {
      return
    }
    // Lynx 不支持 :host，组合选择器会被 encoder 整组删除；保留已有的根变量分支。
    rule.selector = ':root'
  })
}

function normalizeOpacityPercentages(root: postcss.Root) {
  root.walkDecls(/^opacity$/i, (decl) => {
    if (isCssPropertyRegistration(decl)) {
      return
    }
    // PostCSS 将值内注释保存在 raws；仅在原值未被前序转换修改时读取。
    const raw = decl.raws.value
    const parsed = valueParser(raw?.value === decl.value ? raw.raw : decl.value)
    const tokens = parsed.nodes.filter(node => node.type !== 'space' && node.type !== 'comment')
    const token = tokens[0]
    // Lynx 4.0.1 的 opacity 使用 NumberHandler；仅转换明确的单个百分比，不推断动态变量。
    if (tokens.length !== 1 || token?.type !== 'word' || !/^[+-]?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?%$/i.test(token.value)) {
      return
    }
    const number = Number(token.value.slice(0, -1)) / 100
    if (Number.isFinite(number)) {
      token.value = String(number)
      decl.value = parsed.toString()
    }
  })
}

/** 保留 Lynx 的 Tailwind 默认变量，静态化稳定 theme 值并适配原生 opacity 数值。 */
export function transformLynxCssCompat(css: string) {
  try {
    const root = postcss.parse(css)
    normalizeTailwindDefaultSelectors(root)
    const properties = collectTailwindThemeProperties(root)
    if (properties.size > 0) {
      root.walkDecls((decl) => {
        if (!isCssPropertyRegistration(decl)) {
          decl.value = resolveCustomPropertyVarValue(decl.value, properties)
        }
      })
      removeConsumedThemeProperties(root, properties)
      postcss([postcssCalc({ filterDeclaration: decl => !isCssPropertyRegistration(decl) })]).process(root, { from: undefined }).sync()
    }
    // 先完成变量依赖与覆盖分析，再缩减 encoder 无法承载的根选择器分支。
    normalizeThemeRootSelectors(root)
    normalizeOpacityPercentages(root)
    return root.toString()
  }
  catch {
    return css
  }
}
