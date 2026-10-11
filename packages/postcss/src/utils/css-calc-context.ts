import type { Declaration } from 'postcss'
import postcss from 'postcss'
import valueParser from 'postcss-value-parser'
import { MINI_PROGRAM_THEME_SCOPE_SELECTORS } from '../compat/mini-program-css/selectors'
import { decodeCssIdentifier, getCssAtRulePrelude, getCssCalcVariableReferences, getCssCustomPropertyName, isCssVarFunction } from './css-custom-property'

export interface CssCalcContext {
  customPropertyValues: Map<string, string>
  unsafeCustomProperties: Set<string>
}

/** 只接受无条件主题根；层叠层允许提供候选值，冲突统一在后续排除。 */
export function isCssCalcThemeDeclaration(decl: Declaration) {
  const rule = decl.parent
  if (rule?.type !== 'rule' || !rule.selectors.length
    || !rule.selectors.every(selector => MINI_PROGRAM_THEME_SCOPE_SELECTORS.has(selector.trim()))) {
    return false
  }
  // 生成主题根可以包含兼容别名，但单独的局部别名不覆盖文档根。
  if (!rule.selectors.some(selector => [':root', 'page'].includes(selector.trim()))) {
    return false
  }
  let parent = rule.parent
  while (parent && parent.type !== 'root') {
    if (parent.type !== 'atrule' || getCssAtRulePrelude(parent).name.toLowerCase() !== 'layer') {
      return false
    }
    parent = parent.parent
  }
  return parent?.type === 'root'
}

function isSourceThemeDeclaration(decl: Declaration) {
  let parent = decl.parent
  while (parent && parent.type !== 'root') {
    if (parent.type === 'atrule' && getCssAtRulePrelude(parent).name.toLowerCase() === 'theme') {
      return true
    }
    parent = parent.parent
  }
  return false
}

function getDependencies(value: string) {
  return new Set(getCssCalcVariableReferences(value).values())
}

function isCssWideValue(value: string) {
  return /^(?:initial|inherit|unset|revert|revert-layer)$/i.test(decodeCssIdentifier(value) ?? value)
}

/**
 * 推导可供 calc 静态化的主题变量；局部、条件、冲突及未解析依赖一律保留运行时语义。
 * 原始 @theme 由编译器处理，此处只消费其生成的有效主题根。
 */
export function analyzeCssCalcContext(css: string, explicitValues?: ReadonlyMap<string, string>): CssCalcContext {
  const customPropertyValues = new Map<string, string>()
  const unsafeCustomProperties = new Set<string>()
  try {
    const root = postcss.parse(css)
    root.walkAtRules((rule) => {
      const prelude = getCssAtRulePrelude(rule)
      if (prelude.name.toLowerCase() === 'property') {
        unsafeCustomProperties.add(getCssCustomPropertyName(prelude.params) ?? prelude.params.trim())
      }
    })
    root.walkDecls((decl) => {
      const name = getCssCustomPropertyName(decl.prop)
      if (!name || isSourceThemeDeclaration(decl)) {
        return
      }
      const value = decl.value.trim()
      if (!isCssCalcThemeDeclaration(decl) || isCssWideValue(value)
        || (customPropertyValues.has(name) && customPropertyValues.get(name) !== value)) {
        unsafeCustomProperties.add(name)
      }
      else {
        customPropertyValues.set(name, value)
      }
    })
  }
  catch {
    // 上下文语法不完整时不以外部映射猜测变量语义。
    return { customPropertyValues, unsafeCustomProperties }
  }

  // 显式值只替换求值候选，源码依赖不能因此消失，否则会掩盖动态覆盖、循环和未解析别名。
  const dependencies = new Map([...customPropertyValues].map(([name, value]) => [name, getDependencies(value)]))
  for (const [rawName, value] of explicitValues ?? []) {
    const name = getCssCustomPropertyName(rawName)
    if (name && !unsafeCustomProperties.has(name)) {
      customPropertyValues.set(name, value)
      dependencies.set(name, new Set([
        ...dependencies.get(name) ?? [],
        ...getDependencies(value),
      ]))
    }
  }
  const visiting = new Set<string>()
  const resolved = new Set<string>()
  function isSafe(name: string): boolean {
    if (unsafeCustomProperties.has(name)) {
      return false
    }
    if (resolved.has(name)) {
      return true
    }
    const value = customPropertyValues.get(name)
    if (value === undefined || isCssWideValue(value)
      || visiting.has(name) || visiting.size >= 256) {
      unsafeCustomProperties.add(name)
      return false
    }
    visiting.add(name)
    for (const dependency of dependencies.get(name) ?? []) {
      if (!isSafe(dependency)) {
        visiting.delete(name)
        unsafeCustomProperties.add(name)
        return false
      }
    }
    visiting.delete(name)
    // 只替换已证明安全的依赖；白名单限制外层使用点，不要求用户重复列出内部别名。
    if (dependencies.get(name)?.size) {
      const parsed = valueParser(value)
      parsed.walk((node, index, nodes) => {
        if (node.type !== 'function' || !isCssVarFunction(node.value)) {
          return
        }
        const comma = node.nodes.findIndex(child => child.type === 'div' && child.value === ',')
        const rawDependency = valueParser.stringify(comma < 0 ? node.nodes : node.nodes.slice(0, comma))
        const dependency = getCssCustomPropertyName(rawDependency) ?? rawDependency.trim()
        nodes[index] = {
          type: 'word',
          value: customPropertyValues.get(dependency)!,
          sourceIndex: node.sourceIndex,
          sourceEndIndex: node.sourceEndIndex,
        }
        return false
      })
      customPropertyValues.set(name, parsed.toString())
    }
    resolved.add(name)
    return true
  }
  for (const name of customPropertyValues.keys()) {
    if (!isSafe(name)) {
      customPropertyValues.delete(name)
    }
  }
  return { customPropertyValues, unsafeCustomProperties }
}
