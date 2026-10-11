import { readFileSync } from 'node:fs'

type StaticContentValue = string | StaticContentValue[] | { files: StaticContentValue }

function skipWhitespaceAndComments(source: string, start: number) {
  let index = start
  while (index < source.length) {
    const char = source[index]
    if (/\s/.test(char ?? '')) {
      index += 1
      continue
    }
    if (char === '/' && source[index + 1] === '/') {
      index += 2
      while (index < source.length && source[index] !== '\n') {
        index += 1
      }
      continue
    }
    if (char === '/' && source[index + 1] === '*') {
      index += 2
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        index += 1
      }
      index = Math.min(index + 2, source.length)
      continue
    }
    break
  }
  return index
}

function readQuotedString(source: string, start: number) {
  const quote = source[start]
  if (quote !== '"' && quote !== '\'') {
    return
  }

  let value = ''
  for (let index = start + 1; index < source.length; index++) {
    const char = source[index]
    if (char === '\\') {
      const next = source[index + 1]
      if (next === undefined) {
        return
      }
      value += next
      index += 1
      continue
    }
    if (char === quote) {
      return {
        end: index + 1,
        value,
      }
    }
    value += char
  }
}

function readIdentifier(source: string, start: number) {
  const match = /^[A-Z_$][\w$]*/i.exec(source.slice(start))
  return match?.[0]
}

function findMatchingBracket(source: string, start: number, open: string, close: string) {
  let depth = 0
  let quote: string | undefined
  for (let index = start; index < source.length; index++) {
    const char = source[index]
    if (char === '\\') {
      index += 1
      continue
    }
    if (quote) {
      if (char === quote) {
        quote = undefined
      }
      continue
    }
    if (char === '"' || char === '\'') {
      quote = char
      continue
    }
    if (char === '`') {
      return
    }
    if (char === open) {
      depth += 1
      continue
    }
    if (char === close) {
      depth -= 1
      if (depth === 0) {
        return index
      }
    }
  }
}

function findContentPropertyValue(source: string) {
  let index = 0
  while (index < source.length) {
    const nextIndex = source.indexOf('content', index)
    if (nextIndex === -1) {
      return
    }

    const previous = source[nextIndex - 1]
    const next = source[nextIndex + 'content'.length]
    if (
      (previous && /[\w$]/.test(previous))
      || (next && /[\w$]/.test(next))
    ) {
      index = nextIndex + 'content'.length
      continue
    }

    let colonIndex = skipWhitespaceAndComments(source, nextIndex + 'content'.length)
    if (source[colonIndex] !== ':') {
      index = nextIndex + 'content'.length
      continue
    }

    colonIndex = skipWhitespaceAndComments(source, colonIndex + 1)
    return {
      start: colonIndex,
    }
  }
}

function parseStaticContentArray(source: string, start: number): { end: number, value: StaticContentValue[] } | undefined {
  if (source[start] !== '[') {
    return
  }

  const value: StaticContentValue[] = []
  let index = skipWhitespaceAndComments(source, start + 1)
  while (index < source.length) {
    if (source[index] === ']') {
      return {
        end: index + 1,
        value,
      }
    }

    const parsed = parseStaticContentValue(source, index)
    if (!parsed) {
      return
    }
    value.push(parsed.value)
    index = skipWhitespaceAndComments(source, parsed.end)
    if (source[index] === ',') {
      index = skipWhitespaceAndComments(source, index + 1)
      continue
    }
    if (source[index] === ']') {
      continue
    }
    return
  }
}

function parseStaticContentObject(source: string, start: number): { end: number, value: { files: StaticContentValue } } | undefined {
  if (source[start] !== '{') {
    return
  }

  const end = findMatchingBracket(source, start, '{', '}')
  if (end === undefined) {
    return
  }

  let index = skipWhitespaceAndComments(source, start + 1)
  let files: StaticContentValue | undefined
  while (index < end) {
    let key: string | undefined
    const quotedKey = readQuotedString(source, index)
    if (quotedKey) {
      key = quotedKey.value
      index = quotedKey.end
    }
    else {
      key = readIdentifier(source, index)
      if (!key) {
        return
      }
      index += key.length
    }

    index = skipWhitespaceAndComments(source, index)
    if (source[index] !== ':') {
      return
    }
    index = skipWhitespaceAndComments(source, index + 1)
    const parsedValue = parseStaticContentValue(source, index)
    if (!parsedValue) {
      return
    }
    if (key === 'files') {
      files = parsedValue.value
    }
    index = skipWhitespaceAndComments(source, parsedValue.end)
    if (source[index] === ',') {
      index = skipWhitespaceAndComments(source, index + 1)
      continue
    }
    if (index < end) {
      return
    }
  }

  return files === undefined
    ? undefined
    : {
        end: end + 1,
        value: { files },
      }
}

function parseStaticContentValue(source: string, start: number): { end: number, value: StaticContentValue } | undefined {
  const index = skipWhitespaceAndComments(source, start)
  const quoted = readQuotedString(source, index)
  if (quoted) {
    return quoted
  }
  if (source[index] === '[') {
    return parseStaticContentArray(source, index)
  }
  if (source[index] === '{') {
    return parseStaticContentObject(source, index)
  }
}

export function readStaticConfigContent(configPath: string): StaticContentValue | undefined {
  let source: string
  try {
    source = readFileSync(configPath, 'utf8')
  }
  catch {
    return
  }

  const contentProperty = findContentPropertyValue(source)
  if (!contentProperty) {
    return
  }
  return parseStaticContentValue(source, contentProperty.start)?.value
}
