import type { Node } from 'postcss-value-parser'
import { serializeRGB } from '@csstools/css-color-parser'
import valueParser from 'postcss-value-parser'
import { isCssVarFunction } from '../../utils/css-custom-property'
import { readValidVariableName } from '../../utils/css-variable-name'
import { hasUnsupportedModernColorFunction } from './modern'
import { parseAlphaValue, resolveColorData, trimNodes } from './parse'

/** 在序列化器补齐括号之前验证完整变量语法，fallback 原文由运行时解释。 */
export function hasCompleteColorMixFunctions(nodes: Node[], depth = 0): boolean {
  if (depth > 32) {
    return false
  }
  return nodes.every(node => node.type !== 'function' || (
    !node.unclosed
    && (!isCssVarFunction(node.value) || !!readValidVariableName(node))
    && hasCompleteColorMixFunctions(node.nodes, depth + 1)
  ))
}

export function normalizeDynamicColorMixAlpha(color: string, nodes: Node[], values: ReadonlyMap<string, string>) {
  const alphaNodes = trimNodes(nodes).filter(node => node.type !== 'comment')
  const variable = alphaNodes.length === 1 ? alphaNodes[0] : undefined
  if (variable?.type !== 'function' || !isCssVarFunction(variable.value)) {
    return undefined
  }
  const property = readValidVariableName(variable)
  const knownValue = property && values.get(property)
  // 已证明为非法静态权重时不能借兼容模式把无效 mix 变成有效颜色。
  if (!property || (knownValue !== undefined && parseAlphaValue(knownValue) === undefined)) {
    return undefined
  }
  const alpha = valueParser.stringify(nodes).trim()
  if (hasUnsupportedModernColorFunction(alpha)) {
    return undefined
  }
  const resolved = resolveColorData(color, values)
  if (!resolved || resolved.alpha !== 1) {
    return undefined
  }
  const parsed = valueParser(serializeRGB(resolved).toString())
  const rgb = parsed.nodes[0]
  if (rgb?.type !== 'function') {
    return undefined
  }
  rgb.value = 'rgba'
  rgb.nodes.push(...valueParser(`, ${alpha}`).nodes)
  return parsed.toString()
}
