import type { ElementNode, TemplateChildNode } from '@vue/compiler-dom'
import { baseParse, NodeTypes } from '@vue/compiler-dom'
import { parse } from '@vue/compiler-sfc'

/** uni-app 的 module script 属于视图层；从 Vue SFC 逻辑脚本解析中排除，保留原始偏移。 */
export function parseRuntimeProbeSource(source: string) {
  const root = baseParse(source, { parseMode: 'sfc' })
  const modules = root.children.filter((node): node is ElementNode => node.type === NodeTypes.ELEMENT
    && node.tag === 'script' && node.props.some(property => property.type === NodeTypes.ATTRIBUTE && property.name === 'module'))
  let logicalSource = source
  for (const module of modules.toReversed()) {
    logicalSource = logicalSource.slice(0, module.loc.start.offset)
      + module.loc.source.replace(/[^\r\n]/g, ' ')
      + logicalSource.slice(module.loc.end.offset)
  }
  const result = parse(logicalSource, { filename: 'runtime-probe.vue' })
  if (result.errors.length) {
    throw new Error('运行时结构探针无法解析 Vue SFC', { cause: result.errors[0] })
  }
  return result.descriptor
}

export function findRuntimeProbeView(source: string) {
  const template = parseRuntimeProbeSource(source).template
  if (!template || (template.lang && template.lang !== 'html')) {
    throw new Error('运行时结构探针需要 HTML template')
  }
  const visit = (nodes: TemplateChildNode[]): ElementNode | undefined => {
    for (const node of nodes) {
      if (node.type !== NodeTypes.ELEMENT) {
        continue
      }
      if (node.tag === 'view') {
        return node
      }
      const child = visit(node.children)
      if (child) {
        return child
      }
    }
  }
  const view = visit(baseParse(template.content).children)
  if (!view) {
    throw new Error('运行时结构探针缺少可绑定的 view')
  }
  return template.loc.start.offset + view.loc.start.offset + '<view'.length
}
