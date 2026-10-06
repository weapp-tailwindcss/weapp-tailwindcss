import type { AtRule } from 'postcss'
import { tokenize, TokenType } from '@csstools/css-tokenizer'
import valueParser from 'postcss-value-parser'

export function decodeCssIdentifier(source: string) {
  if (/^[-_a-z][\w-]*$/i.test(source)) {
    return source
  }
  const tokens = tokenize({ css: source }).filter(token =>
    token[0] !== TokenType.Whitespace && token[0] !== TokenType.Comment && token[0] !== TokenType.EOF,
  )
  const token = tokens[0]
  return tokens.length === 1 && token?.[0] === TokenType.Ident ? token[4].value : undefined
}

/** PostCSS 可能把十六进制转义的终止空白拆入 params，需要按原始前导 token 还原。 */
export function getCssAtRulePrelude(rule: AtRule) {
  if (!rule.name.includes('\\') && !(rule.raws.afterName === '' && rule.params.startsWith('\\'))) {
    return { name: rule.name, params: rule.params }
  }
  const source = `@${rule.name}${rule.raws.afterName ?? ' '}${rule.params}`
  const token = tokenize({ css: source })[0]
  return token?.[0] === TokenType.AtKeyword
    ? { name: token[4].value, params: source.slice(token[3] + 1).trimStart() }
    : { name: rule.name, params: rule.params }
}

/** 按 CSS token 解码名称，保留自定义属性的大小写及转义终止空白语义。 */
export function getCssCustomPropertyName(source: string) {
  if (/^--[\w-]+$/.test(source)) {
    return source
  }
  if (!source.trimStart().startsWith('--') && !source.includes('\\')) {
    return undefined
  }
  const name = decodeCssIdentifier(source)
  return name?.startsWith('--') && name.length > 2 ? name : undefined
}

export function isCssVarFunction(name: string) {
  return (name.includes('\\') ? decodeCssIdentifier(name) : name)?.toLowerCase() === 'var'
}

/** 同时保留引用处的原始拼写，供底层 calc 匹配；安全判断只使用解码后的身份。 */
export function getCssCalcVariableReferences(value: string) {
  const references = new Map<string, string>()
  if (!value.includes('(')) {
    return references
  }
  if (value.includes('\\')) {
    // value-parser 会把转义终止空白拆开；tokenizer 保留函数与参数的真实身份。
    const tokens = tokenize({ css: value })
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index]
      if (token?.[0] !== TokenType.Function || token[4].value.toLowerCase() !== 'var') {
        continue
      }
      let end = index + 1
      while (tokens[end]?.[0] === TokenType.Whitespace || tokens[end]?.[0] === TokenType.Comment) {
        end++
      }
      const name = tokens[end]
      if (name?.[0] !== TokenType.Ident || !name[4].value.startsWith('--')) {
        continue
      }
      end++
      while (tokens[end]?.[0] === TokenType.Whitespace || tokens[end]?.[0] === TokenType.Comment) {
        end++
      }
      const separator = tokens[end]
      if (separator?.[0] === TokenType.Comma || separator?.[0] === TokenType.CloseParen) {
        references.set(value.slice(token[3] + 1, separator[2]).trim(), name[4].value)
      }
    }
  }
  valueParser(value).walk((node) => {
    if (node.type !== 'function' || !isCssVarFunction(node.value)) {
      return
    }
    const comma = node.nodes.findIndex(child => child.type === 'div' && child.value === ',')
    const raw = valueParser.stringify(comma < 0 ? node.nodes : node.nodes.slice(0, comma))
    references.set(raw.trim(), getCssCustomPropertyName(raw) ?? raw.trim())
  })
  return references
}

/** 内部共享匹配入口：字符串按 CSS 名称解码，正则匹配解码后的身份。 */
export function isCssCalcCustomPropertySelected(name: string, includes: readonly (string | RegExp)[] | undefined) {
  return includes?.some(entry => typeof entry === 'string'
    ? getCssCustomPropertyName(entry) === name
    : new RegExp(entry.source, entry.flags).test(name)) ?? false
}
