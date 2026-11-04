import type postcss from 'postcss'
import { tokenize, TokenType } from '@csstools/css-tokenizer'
import { normalizeCssSignatureValue } from './predicates'

/** 字符串按 CSS 语义解码，其它 token 保留身份；选择器清理不能应用到声明内容。 */
function createCssValueSignature(value: string) {
  let invalid = false
  const tokens = tokenize({ css: value }, { onParseError: () => {
    invalid = true
  } })
  if (invalid) {
    return ['invalid', value]
  }
  return tokens.filter(token => token[0] !== TokenType.EOF).map(token => [
    token[0],
    token[0] === TokenType.String ? token[4].value : token[0] === TokenType.Whitespace ? ' ' : token[1],
  ])
}

/** 只缓存本轮不可变的值字符串；容器随清理变化，不能缓存 AST 子树。 */
export function createCoverageSignatures() {
  const values = new Map<string, unknown>()
  function valueSignature(value: string): unknown {
    if (!values.has(value)) {
      values.set(value, createCssValueSignature(value))
    }
    return values.get(value)
  }

  function declarationSignature(node: postcss.Declaration) {
    return [node.prop, valueSignature(node.value), node.important === true]
  }

  return {
    declaration(node: postcss.Declaration) {
      return JSON.stringify(declarationSignature(node))
    },
    selector(rule: postcss.Rule, selector: string) {
      const normalized = normalizeCssSignatureValue(selector)
      const ancestors = ancestorSignature(rule, valueSignature)
      return ancestors.length ? JSON.stringify([ancestors, normalized]) : normalized
    },
    node(node: postcss.Rule | postcss.AtRule) {
      // 嵌套签名保持结构，只在最终 key 序列化一次，避免反复转义放大。
      return JSON.stringify([ancestorSignature(node, valueSignature), nodeSignature(node, valueSignature, declarationSignature)])
    },
  }
}

export type CoverageSignatures = ReturnType<typeof createCoverageSignatures>

function nodeSignature(node: postcss.ChildNode, valueSignature: (value: string) => unknown, declarationSignature: (node: postcss.Declaration) => unknown): unknown {
  if (node.type === 'decl') {
    return ['decl', declarationSignature(node)]
  }
  if (node.type === 'rule') {
    return ['rule', normalizeCssSignatureValue(node.selector), node.nodes.filter(child => child.type !== 'comment').map(child => nodeSignature(child, valueSignature, declarationSignature))]
  }
  if (node.type === 'atrule') {
    return ['atrule', node.name, valueSignature(node.params), node.nodes?.filter(child => child.type !== 'comment').map(child => nodeSignature(child, valueSignature, declarationSignature))]
  }
  return ['raw', node.toString()]
}

/** 条件及嵌套来源属于覆盖证明，不能用条件内样式删除条件外规则。 */
function ancestorSignature(node: postcss.Node, valueSignature: (value: string) => unknown) {
  const ancestors: unknown[] = []
  let parent = node.parent
  while (parent) {
    if (parent.type === 'atrule') {
      ancestors.unshift(['atrule', parent.name, valueSignature(parent.params)])
    }
    else if (parent.type === 'rule') {
      ancestors.unshift(['rule', normalizeCssSignatureValue(parent.selector)])
    }
    parent = parent.parent
  }
  return ancestors
}
