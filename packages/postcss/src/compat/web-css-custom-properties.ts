import type { Node } from 'postcss-value-parser'
import postcss from 'postcss'
import valueParser from 'postcss-value-parser'

const cssWideKeywords = new Set(['initial', 'inherit', 'unset', 'revert', 'revert-layer'])

export interface CustomPropertyValues {
  values: Map<string, string>
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
export function collectCustomPropertyValues(root: postcss.Root): CustomPropertyValues {
  const candidates = new Map<string, string>()
  const dynamic = new Set<string>()

  root.walkDecls((decl) => {
    if (!decl.prop.startsWith('--') || decl.prop.startsWith('--tw-')) {
      return
    }

    const rule = decl.parent?.type === 'rule' ? decl.parent : undefined
    const value = decl.value.trim()
    const isStableDeclaration = !!rule
      && isUnconditionalLayerScope(rule, root)
      && isRootScopeSelector(rule.selector)
      && !decl.important
      && !cssWideKeywords.has(value.toLowerCase())

    if (!isStableDeclaration) {
      dynamic.add(decl.prop)
      return
    }

    const previous = candidates.get(decl.prop)
    if (previous && previous !== value) {
      dynamic.add(decl.prop)
      return
    }
    candidates.set(decl.prop, value)
  })

  for (const property of dynamic) {
    candidates.delete(property)
  }

  // 别名只有在其完整依赖链也静态可解析时才可参与 use-site 替换。
  const values = new Map<string, string>()
  for (const property of candidates.keys()) {
    const value = resolveStaticCustomPropertyValue(property, candidates)
    if (value !== undefined) {
      values.set(property, value)
    }
  }

  return { values }
}

function getCustomPropertyReference(node: Node) {
  if (node.type !== 'function' || node.value.toLowerCase() !== 'var') {
    return undefined
  }
  return node.nodes.find(child => child.type === 'word' && child.value.startsWith('--'))?.value
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
): string | undefined {
  const value = customPropertyValues.get(property)
  if (value === undefined || resolving.has(property)) {
    return undefined
  }

  const nextResolving = new Set(resolving)
  nextResolving.add(property)
  const parsed = valueParser(value)
  let unresolved = false
  parsed.walk((node) => {
    const referencedProperty = getCustomPropertyReference(node)
    if (!referencedProperty) {
      return
    }
    const referencedValue = resolveStaticCustomPropertyValue(referencedProperty, customPropertyValues, nextResolving)
    if (referencedValue === undefined) {
      unresolved = true
      return
    }
    replaceValueParserNode(node, referencedValue)
  })
  return unresolved ? undefined : parsed.toString()
}

export function resolveCustomPropertyVarValue(
  value: string,
  customPropertyValues: ReadonlyMap<string, string>,
) {
  if (!value.includes('var(')) {
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
    replaceValueParserNode(node, customPropertyValue)
    changed = true
  })
  return changed ? parsed.toString() : value
}

export function usesResolvableTailwindColorVariable(
  value: string,
  customPropertyValues: ReadonlyMap<string, string>,
) {
  if (!value.includes('var(')) {
    return false
  }

  const parsed = valueParser(value)
  let usesColorVariable = false
  parsed.walk((node) => {
    if (node.type !== 'function' || node.value.toLowerCase() !== 'var') {
      return
    }
    const property = getCustomPropertyReference(node)
    if (property?.startsWith('--color-') && customPropertyValues.has(property)) {
      usesColorVariable = true
    }
  })
  return usesColorVariable
}
