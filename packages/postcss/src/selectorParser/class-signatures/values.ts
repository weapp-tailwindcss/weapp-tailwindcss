import type { Declaration, Root } from 'postcss'
import valueParser from 'postcss-value-parser'
import { MINI_PROGRAM_THEME_SCOPE_SELECTORS } from '../../compat/mini-program-css/selectors'
import { decodeCssIdentifier, getCssAtRulePrelude, getCssCalcVariableReferences, getCssCustomPropertyName, isCssVarFunction } from '../../utils/css-custom-property'
import { canInlineFontSizeValue, canInlineMarginValue, isStaticNumericFallback } from './declaration-proof'
import { readValidVariableName } from './variable-name'

interface ResolvedSignature {
  nodes: unknown[]
  size: number
  unresolved: boolean
}

type ResolveVariable = (name: string) => ResolvedSignature | undefined

const maxSignatureSize = 65_536

function serializeNodes(nodes: valueParser.Node[], resolveVariable?: ResolveVariable, allowCalcFallback = false): unknown[] {
  return nodes.filter(node => node.type !== 'space' && node.type !== 'comment').flatMap((node): unknown[] => {
    if (node.type === 'function') {
      let children = node.nodes
      if (resolveVariable && !node.unclosed && isCssVarFunction(node.value)) {
        const comma = children.findIndex(child => child.type === 'div' && child.value === ',')
        const name = readValidVariableName(node)
        // 只删除无依赖且永不选中的静态 fallback，不内联自定义属性或改变依赖图。
        if (comma >= 0 && name && isStaticNumericFallback(children.slice(comma + 1), allowCalcFallback) && resolveVariable(name)) {
          children = children.slice(0, comma)
        }
      }
      return [[node.type, node.value, serializeNodes(children, resolveVariable, allowCalcFallback)]]
    }
    return [[node.type, node.value, node.type === 'string' ? node.quote : undefined]]
  })
}

function resolveNodes(nodes: valueParser.Node[], resolveVariable: ResolveVariable): ResolvedSignature | undefined {
  const result: ResolvedSignature = { nodes: [], size: 2, unresolved: false }
  for (const node of nodes) {
    if (node.type === 'space' || node.type === 'comment') {
      continue
    }
    let fragment: ResolvedSignature
    if (node.type === 'function' && isCssVarFunction(node.value)) {
      const name = readValidVariableName(node)
      const resolved = name && !node.unclosed ? resolveVariable(name) : undefined
      // 未解析的外层 var 保持原位；仅移除内层已证明根绑定永不选中的静态 fallback。
      // 外层语法无效时不递归规范化，避免掩盖非法 var 参数。
      const raw = resolved ? [] : serializeNodes([node], name ? resolveVariable : undefined, true)
      fragment = resolved ?? { nodes: raw, size: JSON.stringify(raw).length, unresolved: true }
    }
    else if (node.type === 'function') {
      const children = resolveNodes(node.nodes, resolveVariable)
      if (!children) {
        return undefined
      }
      fragment = {
        nodes: [[node.type, node.value, children.nodes]],
        size: JSON.stringify([node.type, node.value]).length + children.size + 3,
        unresolved: children.unresolved,
      }
    }
    else {
      const raw = serializeNodes([node])
      fragment = { nodes: raw, size: JSON.stringify(raw).length, unresolved: false }
    }
    const nextSize = result.size + fragment.size - 2 + (result.nodes.length > 0 && fragment.nodes.length > 0 ? 1 : 0)
    if (nextSize > maxSignatureSize) {
      return undefined
    }
    // 先预算再拼接 AST 节点；不能把 var(--number)px 重新分词为长度 token。
    result.nodes.push(...fragment.nodes)
    result.size = nextSize
    result.unresolved ||= fragment.unresolved
  }
  return result
}

export function valueSignature(value: string): unknown[] {
  return serializeNodes(valueParser(value).nodes)
}

function isUnconditionalRootDeclaration(decl: Declaration) {
  const rule = decl.parent
  if (rule?.type !== 'rule' || rule.parent?.type !== 'root') {
    return false
  }
  const selectors = rule.selectors.map(selector => selector.trim())
  return selectors.every(selector => selector === 'html' || MINI_PROGRAM_THEME_SCOPE_SELECTORS.has(selector))
    && selectors.some(selector => selector === ':root' || selector === 'html' || selector === 'page')
}

function isStaticVariableValue(value: string) {
  if (value.length > maxSignatureSize) {
    return false
  }
  const identifier = decodeCssIdentifier(value)
  if (identifier && /^(?:initial|inherit|unset|revert|revert-layer|revert-rule)$/i.test(identifier)) {
    return false
  }
  let safe = value.trim().length > 0
  valueParser(value).walk((node) => {
    if ((node.type === 'word' && /[!;()[\]{}]/.test(node.value))
      || (node.type === 'string' && node.unclosed)) {
      safe = false
    }
    if (node.type !== 'function') {
      return
    }
    const name = decodeCssIdentifier(node.value)?.toLowerCase() ?? node.value
    // 静态证据只支持确定的数学分组与变量；URL、attr、环境值及未知函数不猜测。
    if (node.unclosed || !['', 'calc', 'var'].includes(name)) {
      safe = false
    }
  })
  return safe
}

/** 只展开输入 CSS 中无条件、无覆盖且依赖完整的根变量，不求解 DOM 或运行时层叠。 */
export function createCssValueSignature(root: Root) {
  const bindings = new Map<string, string>()
  const unsafe = new Set<string>()
  root.walkAtRules((rule) => {
    const prelude = getCssAtRulePrelude(rule)
    if (prelude.name.toLowerCase() === 'property') {
      const name = getCssCustomPropertyName(prelude.params)
      if (name) {
        unsafe.add(name)
      }
    }
  })
  root.walkDecls((decl) => {
    const name = getCssCustomPropertyName(decl.prop)
    if (!name) {
      return
    }
    const value = decl.value.trim()
    const previous = bindings.get(name)
    if (!isUnconditionalRootDeclaration(decl) || !isStaticVariableValue(value)
      || (previous !== undefined && previous !== value)) {
      unsafe.add(name)
    }
    else {
      bindings.set(name, value)
    }
  })
  const cache = new Map<string, ResolvedSignature | undefined>()
  const visiting = new Set<string>()
  const resolveVariable: ResolveVariable = (name) => {
    if (cache.has(name)) {
      return cache.get(name)
    }
    const value = bindings.get(name)
    if (value === undefined || unsafe.has(name) || visiting.has(name) || visiting.size >= 64) {
      return undefined
    }
    visiting.add(name)
    // fallback 中未选中的引用也参与变量依赖图，不能跳过它隐藏的循环。
    for (const dependency of getCssCalcVariableReferences(value).values()) {
      if (resolveVariable(dependency) === undefined) {
        visiting.delete(name)
        cache.set(name, undefined)
        return undefined
      }
    }
    const signature = resolveNodes(valueParser(value).nodes, resolveVariable)
    visiting.delete(name)
    const result = signature?.unresolved ? undefined : signature
    cache.set(name, result)
    return result
  }
  const bindingNodes = (name: string) => resolveVariable(name) ? valueParser(bindings.get(name)!).nodes : undefined
  return (value: string, property: string) => {
    const nodes = valueParser(value).nodes
    if (getCssCustomPropertyName(property)) {
      return serializeNodes(nodes, resolveVariable)
    }
    const resolved = value.length <= maxSignatureSize ? resolveNodes(nodes, resolveVariable) : undefined
    // 完全内联必须另证属性值合法；其它声明仍要求双方保留 computed-value 阶段。
    if (resolved && !resolved.unresolved && canInlineMarginValue(property, nodes, bindingNodes)) {
      // 合法性必须参加两侧签名，避免无效 calc 丢弃空白后碰巧与合法展开结果相同。
      return [['valid-margin-value', resolved.nodes]]
    }
    if (resolved && !resolved.unresolved && canInlineFontSizeValue(property, nodes, bindingNodes)) {
      return [['valid-font-size-value', resolved.nodes]]
    }
    return resolved?.unresolved ? resolved.nodes : serializeNodes(nodes)
  }
}
