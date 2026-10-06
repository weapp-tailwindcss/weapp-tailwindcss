function escape(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
}

/** 序列化实际 Lynx 组件结构；只映射布局节点，不额外注入样式或模拟 utility。 */
export function fixtureHtml(tree: unknown): string {
  if (Array.isArray(tree)) {
    return tree.map(fixtureHtml).join('')
  }
  if (typeof tree === 'string' || typeof tree === 'number') {
    return escape(String(tree))
  }
  if (!tree || typeof tree !== 'object' || !('type' in tree) || !('props' in tree)) {
    return ''
  }
  const node = tree as {
    type: string | symbol | ((props: Record<string, unknown>) => unknown)
    props: { id?: string, className?: string, children?: unknown }
  }
  if (typeof node.type === 'function') {
    return fixtureHtml(node.type(node.props))
  }
  if (typeof node.type === 'symbol') {
    return fixtureHtml(node.props.children)
  }
  if (node.type !== 'view' && node.type !== 'text') {
    throw new Error(`夹具出现未支持的节点：${node.type}`)
  }
  const tag = node.type === 'view' ? 'div' : 'span'
  return `<${tag} id="${escape(node.props.id ?? '')}" class="${escape(node.props.className ?? '')}">${fixtureHtml(node.props.children)}</${tag}>`
}
