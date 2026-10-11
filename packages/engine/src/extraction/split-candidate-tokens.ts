// 参考链接：https://github.com/tailwindlabs/tailwindcss/blob/master/src/lib/regex.js
// eslint-disable-next-line regexp/no-obscure-range
export const validateCandidateTokenRE = /[\w\u00A0-\uFFFF%-?]/

export function isValidCandidateToken(token = ''): token is string {
  return validateCandidateTokenRE.test(token)
}

const SPLIT_CACHE_LIMIT = 8192
const ESCAPED_WHITESPACE_RE = /\\[nrt]/g
const splitCache = new Map<string, string[]>()

function isSplitter(char: string, bracketDepth: number) {
  return bracketDepth === 0 && (char === '"' || /\s/.test(char))
}

function hasClosingQuotedArbitraryValue(code: string, start: number, quote: string) {
  for (let index = start; index < code.length; index++) {
    if (code[index] === '\\') {
      index++
      continue
    }
    if (code[index] === quote) {
      return code.includes(']', index + 1)
    }
  }

  return false
}

function splitBracketAware(code: string) {
  const result: string[] = []
  let bracketDepth = 0
  let bracketQuote: string | undefined
  let start = 0

  for (let index = 0; index < code.length; index++) {
    const char = code[index]
    if (char === undefined) {
      continue
    }
    if (bracketDepth > 0 && char === '\\') {
      index++
      continue
    }

    if (bracketDepth > 0 && (char === '"' || char === '\'')) {
      if (bracketQuote === char) {
        bracketQuote = undefined
      }
      else if (bracketQuote === undefined && hasClosingQuotedArbitraryValue(code, index + 1, char)) {
        bracketQuote = char
      }
    }

    if (bracketQuote === undefined) {
      if (char === '[' && code.includes(']', index + 1)) {
        bracketDepth++
      }
      else if (char === ']' && bracketDepth > 0) {
        bracketDepth--
      }
    }

    if (!isSplitter(char, bracketDepth)) {
      continue
    }

    const candidate = code.slice(start, index)
    if (isValidCandidateToken(candidate)) {
      result.push(candidate)
    }
    start = index + 1
  }

  const candidate = code.slice(start)
  if (isValidCandidateToken(candidate)) {
    result.push(candidate)
  }

  return result
}

export function splitCandidateTokens(code: string) {
  const cached = splitCache.get(code)
  if (cached) {
    return cached
  }

  // 把压缩产物中的转义空白字符(\n \r \t)先还原成空格，避免被粘连到类名上。
  const normalized = code.includes('\\') ? code.replace(ESCAPED_WHITESPACE_RE, ' ') : code
  const result = splitBracketAware(normalized)

  // 防止缓存无限增长。
  if (splitCache.size >= SPLIT_CACHE_LIMIT) {
    splitCache.clear()
  }
  splitCache.set(code, result)

  return result
}
