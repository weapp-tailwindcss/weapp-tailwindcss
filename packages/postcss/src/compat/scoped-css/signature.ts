import type postcss from 'postcss'
import { tokenize, TokenType } from '@csstools/css-tokenizer'
import { normalizeCssSignatureValue } from './predicates'

/** 字符串按 CSS 语义解码，其它 token 保留身份；选择器清理不能应用到声明内容。 */
export function createCssValueSignature(value: string) {
  let invalid = false
  const tokens = tokenize({ css: value }, { onParseError: () => {
    invalid = true
  } })
  if (invalid) {
    return JSON.stringify(['invalid', value])
  }
  return JSON.stringify(tokens.filter(token => token[0] !== TokenType.EOF).map(token => [
    token[0],
    token[0] === TokenType.String ? token[4].value : token[0] === TokenType.Whitespace ? ' ' : token[1],
  ]))
}

export function createDeclarationCoverageKey(node: postcss.Declaration) {
  return JSON.stringify([node.prop, createCssValueSignature(node.value), node.important === true])
}

function nodeSignature(node: postcss.ChildNode): unknown {
  if (node.type === 'decl') {
    return ['decl', createDeclarationCoverageKey(node)]
  }
  if (node.type === 'rule') {
    return ['rule', normalizeCssSignatureValue(node.selector), node.nodes.filter(child => child.type !== 'comment').map(nodeSignature)]
  }
  if (node.type === 'atrule') {
    return ['atrule', node.name, createCssValueSignature(node.params), node.nodes?.filter(child => child.type !== 'comment').map(nodeSignature)]
  }
  return ['raw', node.toString()]
}

/** 条件及嵌套来源属于覆盖证明，不能用条件内样式删除条件外规则。 */
function ancestorSignature(node: postcss.Node) {
  const ancestors: unknown[] = []
  let parent = node.parent
  while (parent) {
    if (parent.type === 'atrule') {
      ancestors.unshift(['atrule', parent.name, createCssValueSignature(parent.params)])
    }
    else if (parent.type === 'rule') {
      ancestors.unshift(['rule', normalizeCssSignatureValue(parent.selector)])
    }
    parent = parent.parent
  }
  return ancestors
}

export function createSelectorCoverageKey(rule: postcss.Rule, selector: string) {
  const normalized = normalizeCssSignatureValue(selector)
  const ancestors = ancestorSignature(rule)
  return ancestors.length ? JSON.stringify([ancestors, normalized]) : normalized
}

export function createComparableNodeKey(node: postcss.Rule | postcss.AtRule) {
  return JSON.stringify([ancestorSignature(node), nodeSignature(node)])
}
