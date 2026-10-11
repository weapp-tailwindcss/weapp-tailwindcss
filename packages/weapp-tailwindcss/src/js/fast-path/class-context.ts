import { isClassHelperName, isClassLikeName } from '../class-context'

interface ContextNode {
  type?: string
  name?: string | ContextNode
  value?: unknown
  key?: ContextNode
  callee?: ContextNode
  property?: ContextNode
  arguments?: readonly object[]
  expressions?: readonly object[]
  quasis?: { value: { cooked?: string | null, raw: string } }[]
  optional?: boolean
  method?: boolean
  kind?: string
}

function readName(node?: ContextNode): string | undefined {
  if (node?.type === 'Identifier' && typeof node.name === 'string') {
    return node.name
  }
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return node.value
  }
  return undefined
}

function isClassHelperCall(node: ContextNode) {
  if (node.type !== 'CallExpression' || node.optional === true) {
    return false
  }
  const callee = node.callee
  const name = callee?.type === 'MemberExpression' && callee.optional !== true
    ? readName(callee.property)
    : callee?.type === 'Identifier' ? readName(callee) : undefined
  return name !== undefined && isClassHelperName(name)
}

/** 判断当前节点是否进入了 Babel class 上下文的一个子树边界。 */
export function isClassContextChild(node: object, parent: object | undefined) {
  const context = parent as ContextNode | undefined
  if (!context) {
    return false
  }
  if (context.type === 'Property' && context.kind === 'init' && !context.method
    && context.value === node) {
    const key = context.key
    const name = key?.type === 'TemplateLiteral' && key.expressions?.length === 0
      ? key.quasis?.[0]?.value.cooked ?? key.quasis?.[0]?.value.raw
      : readName(key)
    return name !== undefined && isClassLikeName(name)
  }
  if (context.type === 'JSXAttribute' && typeof context.name === 'object'
    && context.name.type === 'JSXIdentifier' && typeof context.name.name === 'string'
    && isClassLikeName(context.name.name)) {
    return true
  }
  return isClassHelperCall(context) && context.arguments?.includes(node) === true
}

/** 使用 Babel 相同的关键词与父链规则，AST 身份关系来自 Oxc 节点。 */
export function isClassContextLiteral(node: object, ancestors: readonly object[]) {
  let current = node
  for (let index = ancestors.length - 1; index >= 0; index--) {
    const parent = ancestors[index] as ContextNode
    if (parent.type === 'Property' && parent.kind === 'init' && !parent.method && parent.value === current) {
      const key = parent.key
      const name = key?.type === 'TemplateLiteral' && key.expressions?.length === 0
        ? key.quasis?.[0]?.value.cooked ?? key.quasis?.[0]?.value.raw
        : readName(key)
      if (name && isClassLikeName(name)) {
        return true
      }
    }
    if (parent.type === 'JSXAttribute' && typeof parent.name === 'object'
      && parent.name.type === 'JSXIdentifier' && typeof parent.name.name === 'string'
      && isClassLikeName(parent.name.name)) {
      return true
    }
    if (parent.type === 'CallExpression' && !parent.optional && parent.arguments?.includes(current)) {
      if (isClassHelperCall(parent)) {
        return true
      }
    }
    current = parent
  }
  return false
}
