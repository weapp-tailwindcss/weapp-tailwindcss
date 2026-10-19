/* eslint-disable style/max-statements-per-line */

import type { Node } from 'postcss-value-parser'
import valueParser from 'postcss-value-parser'

interface LengthValue { value: number, dimension: 0 | 1 }

function atom(node: Node | undefined, depth: number): LengthValue | undefined {
  if (!node || depth > 32) { return undefined }
  if (node.type === 'function') {
    return !node.unclosed && (node.value === 'calc' || node.value === '') ? expression(node.nodes, depth + 1) : undefined
  }
  if (node.type !== 'word') { return undefined }
  const match = node.value.match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(px|rem)?$/)
  if (!match) { return undefined }
  return { value: Number(match[1]) * (match[2] === 'rem' ? 16 : 1), dimension: match[2] ? 1 : 0 }
}

function expression(nodes: Node[], depth: number): LengthValue | undefined {
  const tokens = nodes.filter(node => node.type !== 'space' && node.type !== 'comment')
  if (tokens.length > 256) { return undefined }
  let index = 0
  const term = () => {
    let result = atom(tokens[index++], depth)
    while (result && ['*', '/'].includes(tokens[index]?.value ?? '')) {
      const operator = tokens[index++]!.value
      const right = atom(tokens[index++], depth)
      if (!right || (operator === '*' ? result.dimension + right.dimension > 1 : right.dimension !== 0 || right.value === 0)) { return undefined }
      result = { value: operator === '*' ? result.value * right.value : result.value / right.value, dimension: (result.dimension + right.dimension) as 0 | 1 }
    }
    return result
  }
  let result = term()
  while (result && ['+', '-'].includes(tokens[index]?.value ?? '')) {
    const operator = tokens[index++]!.value
    const right = term()
    if (!right || result.dimension !== right.dimension) { return undefined }
    result = { value: operator === '+' ? result.value + right.value : result.value - right.value, dimension: result.dimension }
  }
  return index === tokens.length && result && Number.isFinite(result.value) ? result : undefined
}

/** 阴影长度只接受可静态换算的 px/rem；calc 保留运算优先级与量纲边界。 */
export function parseNativeShadowLength(value: string) {
  const result = expression(valueParser(value).nodes, 0)
  return result && (result.dimension === 1 || result.value === 0) ? result.value : undefined
}
