import { tokenizer, TokenType } from '@csstools/css-tokenizer'

const LOCATION_SYNTAX_HINT_RE = /[@\\]|url\(/i
const ABSOLUTE_URL_RE = /^(?:[a-z][a-z\d+.-]*:|\/|#)/i

function isIndependentUrl(value: string) {
  return ABSOLUTE_URL_RE.test(value.trim())
}

/** 判断 CSS 转换是否依赖资源位置；路径解析和缓存范围仍由调用方负责。 */
export function hasCssLocationDependencies(source: string): boolean {
  // 没有 at-keyword、转义或 url 函数前缀时，不可能包含位置相关语法。
  if (!LOCATION_SYNTAX_HINT_RE.test(source)) {
    return false
  }
  let malformed = false
  const stream = tokenizer({ css: source }, {
    onParseError() {
      malformed = true
    },
  })
  const nextSignificant = () => {
    let token = stream.nextToken()
    while (token[0] === TokenType.Whitespace || token[0] === TokenType.Comment) {
      token = stream.nextToken()
    }
    return token
  }
  while (!stream.endOfFile()) {
    const token = stream.nextToken()
    if (token[0] === TokenType.AtKeyword && token[4].value.toLowerCase() === 'import') {
      return true
    }
    if (token[0] === TokenType.URL && !isIndependentUrl(token[4].value)) {
      return true
    }
    if (token[0] === TokenType.Function && token[4].value.toLowerCase() === 'url') {
      const value = nextSignificant()
      if (value[0] !== TokenType.String || !isIndependentUrl(value[4].value)) {
        return true
      }
      // 动态值、未知 URL modifier 或编辑中的不完整函数保守隔离。
      if (nextSignificant()[0] !== TokenType.CloseParen) {
        return true
      }
    }
  }
  return malformed
}
