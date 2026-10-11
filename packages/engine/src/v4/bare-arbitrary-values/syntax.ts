const HEX_ESCAPE_RE = /^[\da-f]$/i

export function splitVariantPrefix(candidate: string) {
  let depth = 0
  let quote: string | undefined
  let lastSeparator = -1

  for (let index = 0; index < candidate.length; index++) {
    const character = candidate[index]
    if (character === '\\') {
      index++
      continue
    }

    if (quote) {
      if (character === quote) {
        quote = undefined
      }
      continue
    }

    if (character === '"' || character === '\'') {
      quote = character
      continue
    }

    if (character === '[' || character === '(' || character === '{') {
      depth++
      continue
    }

    if (character === ']' || character === ')' || character === '}') {
      depth = Math.max(0, depth - 1)
      continue
    }

    if (depth === 0 && character === ':') {
      lastSeparator = index
    }
  }

  if (lastSeparator === -1) {
    return {
      prefix: '',
      body: candidate,
    }
  }

  return {
    prefix: candidate.slice(0, lastSeparator + 1),
    body: candidate.slice(lastSeparator + 1),
  }
}

export function isBalancedFunctionValue(value: string) {
  let depth = 0
  let quote: string | undefined

  for (let index = 0; index < value.length; index++) {
    const character = value[index]

    if (character === '\\') {
      index++
      continue
    }

    if (quote) {
      if (character === quote) {
        quote = undefined
      }
      continue
    }

    if (character === '"' || character === '\'') {
      quote = character
      continue
    }

    if (character === '(') {
      depth++
      continue
    }

    if (character === ')') {
      depth--
      if (depth < 0) {
        return false
      }
    }
  }

  return depth === 0 && quote === undefined
}

export function isEscapedAt(value: string, index: number) {
  let slashCount = 0
  for (let slashIndex = index - 1; slashIndex >= 0 && value[slashIndex] === '\\'; slashIndex--) {
    slashCount++
  }
  return slashCount % 2 === 1
}

export function isBalancedBareArbitraryBody(value: string) {
  let depth = 0
  let quote: string | undefined

  for (let index = 0; index < value.length; index++) {
    const character = value[index]

    if (isEscapedAt(value, index)) {
      continue
    }

    if (quote) {
      if (character === quote) {
        quote = undefined
      }
      continue
    }

    if (character === '"' || character === '\'') {
      quote = character
      continue
    }

    if (character === '(' || character === '{') {
      depth++
      continue
    }

    if (character === ')' || character === '}') {
      depth--
      if (depth < 0) {
        return false
      }
    }
  }

  return depth === 0 && quote === undefined
}

export function isHexColorValue(value: string) {
  return /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6,8})$/i.test(value)
}

export function isQuotedValue(value: string) {
  const quote = value[0]
  if ((quote !== '"' && quote !== '\'') || value[value.length - 1] !== quote) {
    return false
  }

  let escaped = false
  for (let index = 1; index < value.length - 1; index++) {
    const character = value[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (character === '\\') {
      escaped = true
    }
  }

  return !escaped
}

export function normalizeEscapedValue(value: string) {
  let result = ''
  for (let index = 0; index < value.length; index++) {
    const character = value[index]
    if (character !== '\\') {
      result += character
      continue
    }

    const nextCharacter = value[index + 1]
    if (nextCharacter === undefined) {
      result += character
      continue
    }

    if (HEX_ESCAPE_RE.test(nextCharacter)) {
      let hex = ''
      let nextIndex = index + 1
      while (nextIndex < value.length && hex.length < 6) {
        const hexCharacter = value[nextIndex]
        if (hexCharacter === undefined || !HEX_ESCAPE_RE.test(hexCharacter)) {
          break
        }
        hex += hexCharacter
        nextIndex++
      }
      if (/[\t\n\f\r ]/.test(value[nextIndex] ?? '')) {
        nextIndex++
      }

      const decoded = String.fromCodePoint(Number.parseInt(hex, 16))
      result += decoded === '_' ? '\\_' : decoded
      index = nextIndex - 1
      continue
    }

    result += nextCharacter === '_' ? '\\_' : nextCharacter
    index++
  }
  return result
}
