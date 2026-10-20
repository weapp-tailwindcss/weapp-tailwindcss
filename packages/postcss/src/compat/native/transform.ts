import type { Node } from 'postcss-value-parser'
import valueParser from 'postcss-value-parser'
import { parseNumber } from './values'

function argumentsOf(nodes: Node[]) {
  return nodes
    .filter(node => node.type !== 'space' && node.type !== 'comment' && !(node.type === 'div' && node.value === ','))
    .map(node => valueParser.stringify(node))
}

/** 完整解析 transform 函数列表，任何未知片段都必须使整条声明失败。 */
export function parseNativeTransform(value: string): Array<Record<string, unknown>> | undefined {
  if (value.trim() === 'none') {
    return []
  }
  const result: Array<Record<string, unknown>> = []
  for (const node of valueParser(value).nodes) {
    if (node.type === 'space' || node.type === 'comment') {
      continue
    }
    if (node.type !== 'function' || node.unclosed) {
      return undefined
    }
    const args = argumentsOf(node.nodes)
    if (!args.length || args.length > 2) {
      return undefined
    }
    if (/^(?:rotate[XYZ]?|skew[XY])$/.test(node.value)) {
      if (args.length !== 1 || !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:deg|rad)$/.test(args[0]!)) {
        return undefined
      }
      result.push({ [node.value]: args[0] })
      continue
    }
    if (/^scale[XY]?$/.test(node.value)) {
      const values = args.map(Number)
      if (!values.every(Number.isFinite) || (node.value !== 'scale' && args.length !== 1)) {
        return undefined
      }
      if (args.length === 2) {
        result.push({ scaleX: values[0] }, { scaleY: values[1] })
      }
      else {
        result.push({ [node.value]: values[0] })
      }
      continue
    }
    if (/^translate[XY]?$/.test(node.value)) {
      const values = args.map(arg => parseNumber(arg, {}))
      if (values.includes(undefined) || (node.value !== 'translate' && args.length !== 1)) {
        return undefined
      }
      if (node.value === 'translate') {
        result.push({ translateX: values[0] }, { translateY: values[1] ?? 0 })
      }
      else {
        result.push({ [node.value]: values[0] })
      }
      continue
    }
    return undefined
  }
  return result.length ? result : undefined
}
