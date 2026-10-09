import type { AtRule } from 'postcss'
import type { Reporter } from './reporter'
import { tokenize, TokenType } from '@csstools/css-tokenizer'

const reserved = new Set(['initial', 'inherit', 'unset', 'revert', 'revert-layer', 'default'])

/** CSS 标识符区分大小写；转义解码只在语法边界进行。 */
export function decodedIdentifier(value: string) {
  const tokens = tokenize({ css: value }).filter(token => token[0] !== TokenType.EOF)
  return tokens.length === 1 && tokens[0]?.[0] === TokenType.Ident ? tokens[0][4].value : value
}

export function atRuleName(node: AtRule) {
  return decodedIdentifier(node.name).toLowerCase()
}

export function parseLayerNames(node: AtRule, reporter: Reporter): string[][] {
  const tokens = tokenize({ css: node.params }).filter(token => token[0] !== TokenType.Comment && token[0] !== TokenType.EOF)
  if (tokens.every(token => token[0] === TokenType.Whitespace)) {
    if (!node.nodes) {
      reporter.fail(node, 'LAYER_NAME', '匿名层必须有 block。', '为匿名层添加 block，或提供命名层列表。')
    }
    return []
  }
  const names: string[][] = []
  let path: string[] = []
  let expectIdentifier = true
  const invalid = () => reporter.fail(node, 'LAYER_NAME', `非法层名称：${node.params}`, '使用 CSS 标识符、点分路径或逗号分隔的声明列表。')
  for (const [index, token] of tokens.entries()) {
    if (token[0] === TokenType.Whitespace) {
      const adjacent = [tokens[index - 1], tokens[index + 1]]
      if (adjacent.some(item => item?.[0] === TokenType.Delim && item[4].value === '.')) {
        invalid()
      }
      continue
    }
    if (expectIdentifier) {
      if (token[0] !== TokenType.Ident || reserved.has(token[4].value.toLowerCase())) {
        invalid()
      }
      if (token[0] === TokenType.Ident) {
        path.push(token[4].value)
      }
      expectIdentifier = false
    }
    else if (token[0] === TokenType.Delim && token[4].value === '.') {
      expectIdentifier = true
    }
    else if (token[0] === TokenType.Comma) {
      names.push(path)
      path = []
      expectIdentifier = true
    }
    else {
      invalid()
    }
  }
  if (expectIdentifier) {
    invalid()
  }
  names.push(path)
  if (node.nodes && names.length !== 1) {
    invalid()
  }
  return names
}
