import type { ChildNode } from 'postcss'
import { parseCssSource } from './parse'

type SignatureNode = (string | boolean | SignatureNode[])[]

function rawField(node: ChildNode, field: 'value' | 'selector' | 'params', value: string) {
  const raw = node.raws[field] as { value: string, raw: string } | undefined
  return raw?.value === value ? raw.raw : value
}

function signatureNodes(nodes: ChildNode[]): SignatureNode[] {
  const result: SignatureNode[] = []
  for (const node of nodes) {
    if (node.type === 'comment') {
      continue
    }
    // raws 中也可能包含 *color / _color 等语法，不能把它们当作缩进丢弃。
    const before = node.raws.before?.trim() ?? ''
    const between = node.raws.between?.trim() ?? ''
    if (node.type === 'decl') {
      result.push(['decl', before, node.prop, between, rawField(node, 'value', node.value), Boolean(node.important)])
    }
    else {
      const after = node.raws.after?.trim() ?? ''
      if (node.type === 'rule') {
        result.push(['rule', before, rawField(node, 'selector', node.selector), between, signatureNodes(node.nodes), after])
      }
      else {
        result.push([
          'atrule',
          before,
          node.name,
          node.raws.afterName?.trim() ?? '',
          rawField(node, 'params', node.params),
          between,
          Boolean(node.nodes),
          signatureNodes(node.nodes ?? []),
          after,
        ])
      }
    }
  }
  return result
}

/** 忽略结构性排版，保留值、选择器和 token 边界；不追求合并所有等价 CSS。 */
export function createCssRuntimeAffectingSignature(source: string): string {
  try {
    const root = parseCssSource(source)
    return JSON.stringify(['css', signatureNodes(root.nodes), root.raws.after?.trim() ?? ''])
  }
  catch {
    // 编辑中的不完整源码也必须使缓存失效，不能复用旧样式。
    return JSON.stringify(['raw', source])
  }
}
