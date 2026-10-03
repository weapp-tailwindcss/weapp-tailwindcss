import type valueParser from 'postcss-value-parser'
import { tokenize, TokenType } from '@csstools/css-tokenizer'
import { decodeCssIdentifier, isCssVarFunction } from '../../utils/css-custom-property'
import { readValidVariableName } from './variable-name'

type BindingNodes = (name: string) => valueParser.Node[] | undefined
interface NumericType {
  kind: 'number' | 'length-percentage'
  value: number
}

const marginLonghands = new Set(['margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'margin-block-start', 'margin-block-end', 'margin-inline-start', 'margin-inline-end'])
// 只证明基础长度单位和小程序 rpx；未知或未纳入的单位保留原签名。
const lengthUnits = new Set(['px', 'rpx', 'em', 'rem', 'ex', 'ch', 'vw', 'vh', 'vmin', 'vmax', 'cm', 'mm', 'q', 'in', 'pt', 'pc'])

function numericType(node: valueParser.Node): NumericType | undefined {
  if (node.type !== 'word') {
    return undefined
  }
  const tokens = tokenize({ css: node.value }).filter(token => token[0] !== TokenType.EOF)
  const token = tokens[0]
  if (tokens.length !== 1 || !token) {
    return undefined
  }
  if (token[0] === TokenType.Number && Number.isFinite(token[4].value)) {
    return { kind: 'number', value: token[4].value }
  }
  if ((token[0] === TokenType.Percentage || (token[0] === TokenType.Dimension && lengthUnits.has(token[4].unit.toLowerCase())))
    && Number.isFinite(token[4].value)) {
    return { kind: 'length-percentage', value: Math.abs(token[4].value) }
  }
  return undefined
}

function significantNodes(nodes: valueParser.Node[]) {
  return nodes.filter(node => node.type !== 'space' && node.type !== 'comment')
}

export function isStaticNumericFallback(nodes: valueParser.Node[], allowCalc = false) {
  const significant = significantNodes(nodes)
  const node = significant[0]
  if (significant.length !== 1 || !node) {
    return false
  }
  if (numericType(node)) {
    return true
  }
  // 未选中 fallback 的 calc 只证明有限纯数值，不允许变量依赖或长度运算。
  return allowCalc && node.type === 'function' && !node.unclosed
    && decodeCssIdentifier(node.value)?.toLowerCase() === 'calc'
    && mathType(node.nodes, () => undefined, 0)?.kind === 'number'
}

function getBinding(node: valueParser.FunctionNode, bindingNodes: BindingNodes) {
  const name = readValidVariableName(node)
  return name ? bindingNodes(name) : undefined
}

function isOperator(node: valueParser.Node | undefined, operators: string[]) {
  return (node?.type === 'word' || node?.type === 'div') && operators.includes(node.value)
}

function combine(left: NumericType, operator: string, right: NumericType): NumericType | undefined {
  let kind = left.kind
  let value: number
  if (operator === '+' || operator === '-') {
    if (left.kind !== right.kind) {
      return undefined
    }
    // 长度仅维护绝对值上界；不换算单位，也不据此改写输出表达式。
    value = kind === 'length-percentage' || operator === '+' ? left.value + right.value : left.value - right.value
  }
  else if (operator === '*') {
    if (left.kind !== 'number' && right.kind !== 'number') {
      return undefined
    }
    kind = left.kind === 'number' ? right.kind : left.kind
    value = left.value * right.value
  }
  else {
    if (right.kind !== 'number' || right.value === 0) {
      return undefined
    }
    value = left.value / right.value
  }
  return Number.isFinite(value) ? { kind, value: kind === 'number' ? value : Math.abs(value) } : undefined
}

function mathType(nodes: valueParser.Node[], bindingNodes: BindingNodes, depth: number): NumericType | undefined {
  if (depth >= 64) {
    return undefined
  }
  const items = nodes.map((node, index) => ({ node, index })).filter(item => item.node.type !== 'space' && item.node.type !== 'comment')
  let cursor = 0
  const atom = (): NumericType | undefined => {
    const node = items[cursor++]?.node
    if (!node) {
      return undefined
    }
    if (node.type !== 'function') {
      return numericType(node)
    }
    if (node.unclosed) {
      return undefined
    }
    if (isCssVarFunction(node.value)) {
      const binding = getBinding(node, bindingNodes)
      // 变量只允许替换完整 atom，不能让片段拼接改变运算优先级或 token 边界。
      return binding && significantNodes(binding).length === 1 ? mathType(binding, bindingNodes, depth + 1) : undefined
    }
    const name = decodeCssIdentifier(node.value)?.toLowerCase() ?? node.value
    return name === '' || name === 'calc' ? mathType(node.nodes, bindingNodes, depth + 1) : undefined
  }
  const product = (): NumericType | undefined => {
    let result = atom()
    while (result && isOperator(items[cursor]?.node, ['*', '/'])) {
      const operator = items[cursor++]!.node.value
      const right = atom()
      result = right ? combine(result, operator, right) : undefined
    }
    return result
  }
  let result = product()
  while (result && isOperator(items[cursor]?.node, ['+', '-'])) {
    const item = items[cursor++]!
    // 必须使用原始 AST 的空白；评论和签名打印不能替代 calc 加减号两侧的空白。
    if (nodes[item.index - 1]?.type !== 'space' || nodes[item.index + 1]?.type !== 'space') {
      return undefined
    }
    const right = product()
    result = right ? combine(result, item.node.value, right) : undefined
  }
  return cursor === items.length ? result : undefined
}

function marginType(nodes: valueParser.Node[], bindingNodes: BindingNodes, depth = 0): boolean {
  const items = significantNodes(nodes)
  const node = items[0]
  if (depth >= 64 || items.length !== 1 || !node) {
    return false
  }
  if (node.type === 'word') {
    const numeric = numericType(node)
    return decodeCssIdentifier(node.value)?.toLowerCase() === 'auto'
      || Boolean(numeric && (numeric.kind === 'length-percentage' || numeric.value === 0))
  }
  if (node.type !== 'function' || node.unclosed) {
    return false
  }
  if (isCssVarFunction(node.value)) {
    const binding = getBinding(node, bindingNodes)
    return Boolean(binding && marginType(binding, bindingNodes, depth + 1))
  }
  return decodeCssIdentifier(node.value)?.toLowerCase() === 'calc'
    && mathType(node.nodes, bindingNodes, depth + 1)?.kind === 'length-percentage'
}

/** 只证明 margin 长属性的值是否合法，不合并或求值其规则签名。 */
export function canInlineMarginValue(property: string, nodes: valueParser.Node[], bindingNodes: BindingNodes) {
  return marginLonghands.has(decodeCssIdentifier(property)?.toLowerCase() ?? property)
    && marginType(nodes, bindingNodes)
}

function fontSizeType(nodes: valueParser.Node[], bindingNodes: BindingNodes, depth = 0): boolean {
  const items = significantNodes(nodes)
  const node = items[0]
  if (depth >= 64 || items.length !== 1 || !node) {
    return false
  }
  if (node.type === 'function' && !node.unclosed && isCssVarFunction(node.value)) {
    const binding = getBinding(node, bindingNodes)
    return Boolean(binding && fontSizeType(binding, bindingNodes, depth + 1))
  }
  if (node.type !== 'word') {
    return false
  }
  const tokens = tokenize({ css: node.value }).filter(token => token[0] !== TokenType.EOF)
  const token = tokens[0]
  if (tokens.length !== 1 || !token) {
    return false
  }
  if (token[0] === TokenType.Number) {
    return token[4].value === 0
  }
  // 字号要求非负，不能复用 margin 算术中取绝对值的长度上界。
  return (token[0] === TokenType.Percentage || (token[0] === TokenType.Dimension && lengthUnits.has(token[4].unit.toLowerCase())))
    && Number.isFinite(token[4].value) && token[4].value >= 0
}

/** 只证明 font-size 的非负长度、百分比或裸零；不求值函数和关键字。 */
export function canInlineFontSizeValue(property: string, nodes: valueParser.Node[], bindingNodes: BindingNodes) {
  return decodeCssIdentifier(property)?.toLowerCase() === 'font-size'
    && fontSizeType(nodes, bindingNodes)
}
