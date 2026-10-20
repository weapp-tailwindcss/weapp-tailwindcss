import type { Node } from 'postcss-value-parser'
import postcss from 'postcss'
import valueParser from 'postcss-value-parser'
import { decodeCssIdentifier, getCssAtRulePrelude, getCssCalcVariableReferences, getCssCustomPropertyName, hasCssFunction, isCssVarFunction } from '../utils/css-custom-property'

const cssWideKeywords = new Set(['initial', 'inherit', 'unset', 'revert', 'revert-layer'])

export interface CustomPropertyValues {
  values: Map<string, string>
  dependencies: Set<string>
}

function isRootScopeSelector(selector: string) {
  return postcss.list.comma(selector).every((part) => {
    const normalized = part.trim()
    return normalized === ':root' || normalized === ':host'
  })
}

/**
 * 判断规则是否只位于无条件的级联层中。
 *
 * Tailwind v4 会把主题变量放入 `@layer theme`，该层本身不会按媒体或状态
 * 改变可见值，因此可以参与静态分析；其它条件规则仍必须保留原生级联。
 */
function isUnconditionalLayerScope(rule: postcss.Rule, root: postcss.Root) {
  let parent = rule.parent
  while (parent && parent !== root) {
    if (parent.type !== 'atrule' || parent.name.toLowerCase() !== 'layer') {
      return false
    }
    parent = parent.parent
  }
  return parent === root
}

/**
 * 收集可以安全在 use-site 静态化的作者变量。
 *
 * 只有唯一、无条件的 `:root`/`:host` 声明才具备全局稳定性。局部、条件、
 * 混合 selector、`!important` 以及重复冲突声明都必须保留原生变量级联，避免
 * 在颜色兼容阶段提前删除运行时主题覆盖。
 */
export function collectCustomPropertyValues(
  root: postcss.Root,
  referencedProperties?: ReadonlySet<string> | undefined,
): CustomPropertyValues {
  const candidates = new Map<string, string>()
  const dynamic = new Set<string>()
  const dependencies = new Set<string>()

  root.walkAtRules((rule) => {
    const prelude = getCssAtRulePrelude(rule)
    if (prelude.name.toLowerCase() !== 'property') {
      return
    }
    const property = getCssCustomPropertyName(prelude.params)
    if (property) {
      dynamic.add(property)
    }
  })

  root.walkDecls((decl) => {
    const property = getCssCustomPropertyName(decl.prop)
    if (!property || property.startsWith('--tw-')) {
      return
    }
    if (referencedProperties && !referencedProperties.has(property)) {
      return
    }

    const rule = decl.parent?.type === 'rule' ? decl.parent : undefined
    const value = decl.value.trim()
    const elementDependent = hasCssFunction(value, 'attr')
    if (referencedProperties?.has(property)) {
      for (const dependency of getCssCalcVariableReferences(value).values()) {
        dependencies.add(dependency)
      }
    }
    const isStableDeclaration = !!rule
      && isUnconditionalLayerScope(rule, root)
      && isRootScopeSelector(rule.selector)
      && !decl.important
      && !elementDependent
      && !cssWideKeywords.has((decodeCssIdentifier(value) ?? value).toLowerCase())

    if (!isStableDeclaration) {
      dynamic.add(property)
      return
    }

    const previous = candidates.get(property)
    if (candidates.has(property) && previous !== value) {
      dynamic.add(property)
      return
    }
    candidates.set(property, value)
  })

  for (const property of dynamic) {
    candidates.delete(property)
  }

  // 别名只有在其完整依赖链也静态可解析时才可参与 use-site 替换。
  const values = new Map<string, string>()
  const memo = new Map<string, string | undefined>()
  for (const property of candidates.keys()) {
    const value = resolveStaticCustomPropertyValue(property, candidates, new Set(), memo)
    if (value !== undefined) {
      values.set(property, value)
    }
  }

  return { values, dependencies }
}

function getCustomPropertyReference(node: Node) {
  if (node.type !== 'function' || !isCssVarFunction(node.value)) {
    return undefined
  }
  const comma = node.nodes.findIndex(child => child.type === 'div' && child.value === ',')
  return getCssCustomPropertyName(valueParser.stringify(comma < 0 ? node.nodes : node.nodes.slice(0, comma)))
}

function replaceValueParserNode(node: Node, value: string) {
  const mutableNode = node as Node & { nodes?: Node[] }
  mutableNode.type = 'word'
  mutableNode.value = value
  delete mutableNode.nodes
}

function resolveStaticCustomPropertyValue(
  property: string,
  customPropertyValues: ReadonlyMap<string, string>,
  resolving: ReadonlySet<string> = new Set(),
  memo = new Map<string, string | undefined>(),
): string | undefined {
  if (memo.has(property)) {
    return memo.get(property)
  }
  const value = customPropertyValues.get(property)
  if (value === undefined || resolving.has(property)) {
    return undefined
  }

  // Tailwind 主题变量绝大多数是直接颜色或长度值。它们不包含变量引用，
  // 无需为每个声明构造 value-parser AST；只有别名链才需要递归解析。
  if (!value.includes('(')) {
    memo.set(property, value)
    return value
  }

  const nextResolving = new Set(resolving)
  nextResolving.add(property)
  // 保守检查 fallback 依赖，避免删除尚未证明稳定的引用后改变变量有效性。
  for (const dependency of getCssCalcVariableReferences(value).values()) {
    if (resolveStaticCustomPropertyValue(dependency, customPropertyValues, nextResolving, memo) === undefined) {
      memo.set(property, undefined)
      return undefined
    }
  }
  const parsed = valueParser(value)
  let unresolved = false
  parsed.walk((node) => {
    const referencedProperty = getCustomPropertyReference(node)
    if (!referencedProperty) {
      return
    }
    const referencedValue = memo.get(referencedProperty)
    if (referencedValue === undefined) {
      unresolved = true
      return
    }
    replaceValueParserNode(node, referencedValue)
  })
  const resolved = unresolved ? undefined : parsed.toString()
  memo.set(property, resolved)
  return resolved
}

export function resolveCustomPropertyVarValue(
  value: string,
  customPropertyValues: ReadonlyMap<string, string>,
) {
  if (!value.includes('(')) {
    return value
  }

  const parsed = valueParser(value)
  let changed = false
  parsed.walk((node) => {
    const property = getCustomPropertyReference(node)
    if (!property) {
      return
    }
    const customPropertyValue = customPropertyValues.get(property)
    if (customPropertyValue === undefined) {
      return
    }
    // 不得在循环/动态声明内部删除仍影响 CSS 有效性的 fallback 依赖。
    if ([...getCssCalcVariableReferences(valueParser.stringify(node)).values()].some(reference => !customPropertyValues.has(reference))) {
      return
    }
    replaceValueParserNode(node, customPropertyValue)
    changed = true
  })
  return changed ? parsed.toString() : value
}

export function usesResolvableTailwindColorVariable(
  value: string,
  customPropertyValues: ReadonlyMap<string, string>,
) {
  if (!value.includes('(')) {
    return false
  }

  const parsed = valueParser(value)
  let usesColorVariable = false
  parsed.walk((node) => {
    if (node.type !== 'function' || !isCssVarFunction(node.value)) {
      return
    }
    const property = getCustomPropertyReference(node)
    if (property?.startsWith('--color-') && customPropertyValues.has(property)) {
      usesColorVariable = true
    }
  })
  return usesColorVariable
}
