import type { Node } from 'postcss-value-parser'
import valueParser from 'postcss-value-parser'

/** 保留 CSS 函数边界，解析主题别名及 fallback；未解析值不能送入原生样式。 */
export function resolveNativeVariables(value: string, variables: Record<string, string>, seen = new Set<string>()): string | undefined {
  if (seen.size > 64) {
    return undefined
  }
  const output: string[] = []
  for (const node of valueParser(value).nodes) {
    if (node.type !== 'function') {
      output.push(valueParser.stringify(node))
      continue
    }
    if (node.unclosed) {
      return undefined
    }
    if (node.value !== 'var') {
      const nested = resolveNativeVariables(valueParser.stringify(node.nodes), variables, seen)
      if (nested === undefined) {
        return undefined
      }
      output.push(valueParser.stringify({ ...node, nodes: valueParser(nested).nodes }))
      continue
    }
    const comma = node.nodes.findIndex(item => item.type === 'div' && item.value === ',')
    const name = valueParser.stringify(comma < 0 ? node.nodes : node.nodes.slice(0, comma)).trim()
    const binding = variables[name]
    let resolved: string | undefined
    if (!seen.has(name) && binding !== undefined && !/^(?:initial|unset|revert(?:-layer)?)$/.test(binding.trim())) {
      resolved = resolveNativeVariables(binding, variables, new Set([...seen, name]))
    }
    if (resolved === undefined && comma >= 0) {
      const fallback: Node[] = node.nodes.slice(comma + 1)
      resolved = resolveNativeVariables(valueParser.stringify(fallback), variables, seen)
    }
    if (resolved === undefined) {
      return undefined
    }
    output.push(resolved)
  }
  return output.join('')
}
