import type postcss from 'postcss'
import { tokenizer, TokenType } from '@csstools/css-tokenizer'
import { normalizeCssSignatureValue } from './predicates'

const tokenCodes = new Map(Object.values(TokenType).map((type, index) => [type, String.fromCharCode(65 + index)]))

/** 字符串按 CSS 语义解码，其它 token 保留身份；选择器清理不能应用到声明内容。 */
function createCssValueSignature(value: string) {
  let invalid = false
  const stream = tokenizer({ css: value }, { onParseError: () => {
    invalid = true
  } })
  const chunks = ['v']
  while (true) {
    const token = stream.nextToken()
    if (token[0] === TokenType.EOF) {
      break
    }
    const item = token[0] === TokenType.String ? token[4].value : token[0] === TokenType.Whitespace ? ' ' : token[1]
    // 类型码和 UTF-16 长度界定每个字段，避免分隔符碰撞及完整 token 数组常驻。
    chunks.push(tokenCodes.get(token[0])!, `${item.length}:`, item)
  }
  return invalid ? `i${value}` : chunks.join('')
}

/** 只缓存本轮不可变的值字符串；容器随清理变化，不能缓存 AST 子树。 */
export function createCoverageSignatures(seed?: ReadonlyMap<string, string>): CoverageSignatures {
  const values = new Map<string, string>()
  function valueSignature(value: string): string {
    const inherited = seed?.get(value)
    if (inherited !== undefined) {
      return inherited
    }
    if (!values.has(value)) {
      values.set(value, createCssValueSignature(value))
    }
    return values.get(value)!
  }

  function declarationSignature(node: postcss.Declaration) {
    return [node.prop, valueSignature(node.value), node.important === true]
  }

  return {
    fork() {
      // 根值只读共享；目标新增值只写入子上下文，不能随 preparedCoverage 跨调用累积。
      return createCoverageSignatures(values)
    },
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

export interface CoverageSignatures {
  fork: () => CoverageSignatures
  declaration: (node: postcss.Declaration) => string
  selector: (rule: postcss.Rule, selector: string) => string
  node: (node: postcss.Rule | postcss.AtRule) => string
}

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
