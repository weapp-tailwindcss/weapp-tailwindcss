import type { UnescapeOptions } from './types'
import { ESCAPE_PREFIX, HYPHEN } from './internal-constants'
import {
  createInverseMapping,
  createTokenBuckets,
  createUnescapeMapping,
  DEFAULT_ESCAPE_MAPPING,
} from './mapping'
import { isAsciiNumber } from './predicates'
import { decodeUnicodeSequence } from './unicode'

const ESCAPE_PREFIX_CODE = ESCAPE_PREFIX.codePointAt(0)!
const LOWER_U_CODE = 'u'.codePointAt(0)!

const DEFAULT_UNESCAPE_TABLE = (() => {
  const inverse: Record<string, string> = {}

  for (const [char, token] of Object.entries(DEFAULT_ESCAPE_MAPPING)) {
    inverse[token] = char
  }

  return inverse
})()

function unescapeDefault(value: string, ignoreHead: boolean) {
  const length = value.length

  const hasLeadingEscape = !ignoreHead && value[0] === ESCAPE_PREFIX
  const hasUnicodeMarker = value.includes('u_x')

  if (!hasLeadingEscape && !hasUnicodeMarker) {
    return value
  }

  let cursor = 0
  let result = ''

  while (cursor < length) {
    const currentChar = value[cursor]!
    const currentCode = value.codePointAt(cursor)!

    if (currentCode === LOWER_U_CODE) {
      const decodedUnicode = decodeUnicodeSequence(value, cursor)

      if (decodedUnicode) {
        result += decodedUnicode.char
        cursor += decodedUnicode.length
        continue
      }
    }

    result += currentChar
    cursor++
  }

  if (ignoreHead || result.length === 0 || !result.startsWith(ESCAPE_PREFIX)) {
    return result
  }

  const nextChar = result[1]
  if (!nextChar) {
    return result.slice(1)
  }

  let shouldStrip = isAsciiNumber(nextChar.codePointAt(0)!)

  if (!shouldStrip && nextChar === HYPHEN) {
    const thirdChar = result[2]
    shouldStrip = !thirdChar || isAsciiNumber(thirdChar.codePointAt(0)!)
  }

  return shouldStrip ? result.slice(1) : result
}

export function unescape(
  value: string,
  options?: UnescapeOptions,
) {
  const length = value.length

  if (length === 0) {
    return ''
  }

  const map = createUnescapeMapping(options?.map)
  const ignoreHead = options?.ignoreHead ?? false

  if (!map) {
    return unescapeDefault(value, ignoreHead)
  }

  const usingDefaultMap = map === DEFAULT_ESCAPE_MAPPING
  const { inverse, tokens } = usingDefaultMap
    ? { inverse: {} as Record<string, string>, tokens: [] as string[] }
    : createInverseMapping(map)
  const tokenBuckets = usingDefaultMap
    ? undefined
    : createTokenBuckets(map, tokens)

  let cursor = 0
  let lastUnchangedIndex = 0
  let buffer: string[] | undefined

  while (cursor < length) {
    const currentCode = value.charCodeAt(cursor)
    const currentChar = value[cursor]!
    let replacement: string | undefined
    let advance = 1

    if (replacement === undefined && currentCode === LOWER_U_CODE) {
      const decodedUnicode = decodeUnicodeSequence(value, cursor)

      if (decodedUnicode) {
        replacement = decodedUnicode.char
        advance = decodedUnicode.length
      }
    }

    if (replacement === undefined) {
      if (usingDefaultMap && currentCode === ESCAPE_PREFIX_CODE) {
        const mapped = DEFAULT_UNESCAPE_TABLE[value.slice(cursor, cursor + 2)]

        if (mapped !== undefined) {
          replacement = mapped
          advance = 2
        }
      }
      else if (tokenBuckets) {
        const bucket = tokenBuckets[currentChar]

        if (bucket) {
          for (const token of bucket) {
            if (value.startsWith(token, cursor)) {
              replacement = inverse[token]
              advance = token.length
              break
            }
          }
        }
      }
    }

    if (replacement !== undefined) {
      if (!buffer) {
        buffer = []
      }
      if (lastUnchangedIndex !== cursor) {
        buffer.push(value.slice(lastUnchangedIndex, cursor))
      }
      buffer.push(replacement)
      lastUnchangedIndex = cursor + advance
      cursor += advance
      continue
    }

    cursor += 1
  }

  const result = buffer
    ? (() => {
        if (lastUnchangedIndex < length) {
          buffer!.push(value.slice(lastUnchangedIndex))
        }
        return buffer!.join('')
      })()
    : value

  if (ignoreHead || result.length === 0 || !result.startsWith(ESCAPE_PREFIX)) {
    return result
  }

  const nextChar = result[1]
  if (!nextChar) {
    return result.slice(1)
  }

  let shouldStrip = isAsciiNumber(nextChar.codePointAt(0)!)

  if (!shouldStrip && nextChar === HYPHEN) {
    const thirdChar = result[2]
    shouldStrip = !thirdChar || isAsciiNumber(thirdChar.codePointAt(0)!)
  }

  return shouldStrip ? result.slice(1) : result
}
