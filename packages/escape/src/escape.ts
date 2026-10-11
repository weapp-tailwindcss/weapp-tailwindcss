import type { EscapeOptions } from './types'
import { MAX_ASCII_CHAR_CODE } from './constants'
import { ESCAPE_PREFIX, HYPHEN } from './internal-constants'
import {
  createEscapeMapping,
  DEFAULT_ESCAPE_MAPPING,
  hasOwnKey,
} from './mapping'
import { isAsciiNumber } from './predicates'

const HIGH_SURROGATE_MIN = 0xD800
const HIGH_SURROGATE_MAX = 0xDBFF
const LOW_SURROGATE_MIN = 0xDC00
const LOW_SURROGATE_MAX = 0xDFFF

const DEFAULT_ESCAPE_TABLE = (() => {
  const table: Array<string | undefined> = Array.from({ length: MAX_ASCII_CHAR_CODE + 1 })

  for (const [char, token] of Object.entries(DEFAULT_ESCAPE_MAPPING)) {
    table[char.codePointAt(0)!] = token
  }

  return table
})()

function readCodePoint(str: string, index: number) {
  const first = str.charCodeAt(index)

  if (first < HIGH_SURROGATE_MIN || first > HIGH_SURROGATE_MAX || index + 1 >= str.length) {
    return { codePoint: first, size: 1 }
  }

  const second = str.charCodeAt(index + 1)

  if (second < LOW_SURROGATE_MIN || second > LOW_SURROGATE_MAX) {
    return { codePoint: first, size: 1 }
  }

  return {
    codePoint: ((first - HIGH_SURROGATE_MIN) << 10) + (second - LOW_SURROGATE_MIN) + 0x10000,
    size: 2,
  }
}

function escapeLeadingCharacter(char: string, nextChar: string | undefined, ignoreHead: boolean) {
  if (ignoreHead) {
    return char
  }

  const code = char.codePointAt(0)!

  if (isAsciiNumber(code)) {
    return `${ESCAPE_PREFIX}${char}`
  }

  if (char === HYPHEN) {
    if (!nextChar) {
      return `${ESCAPE_PREFIX}${char}`
    }
    if (isAsciiNumber(nextChar.codePointAt(0)!)) {
      return `${ESCAPE_PREFIX}${char}`
    }
  }

  return char
}

export function escape(
  selectors: string,
  options?: EscapeOptions,
) {
  const length = selectors.length

  if (length === 0) {
    return ''
  }

  const map = createEscapeMapping(options?.map)
  const ignoreHead = options?.ignoreHead ?? false
  const usingDefaultMap = map === DEFAULT_ESCAPE_MAPPING

  let cursor = 0
  let lastUnchangedIndex = 0
  let buffer: string[] | undefined

  while (cursor < length) {
    const { codePoint, size } = readCodePoint(selectors, cursor)
    const isHead = cursor === 0
    let replacement: string | undefined

    if (codePoint > MAX_ASCII_CHAR_CODE) {
      replacement = `u_x${codePoint.toString(16)}_`
    }
    else if (usingDefaultMap) {
      if (isHead) {
        const mapped = DEFAULT_ESCAPE_TABLE[codePoint]

        if (mapped !== undefined) {
          replacement = mapped
        }
        else {
          const nextIndex = cursor + size
          const next = nextIndex < length ? readCodePoint(selectors, nextIndex) : undefined
          const char = selectors[cursor]!
          const nextChar = next
            ? selectors.slice(nextIndex, nextIndex + next.size)
            : undefined
          const escapedHead = escapeLeadingCharacter(char, nextChar, ignoreHead)
          if (escapedHead !== char) {
            replacement = escapedHead
          }
        }
      }
      else {
        const mapped = DEFAULT_ESCAPE_TABLE[codePoint]
        if (mapped !== undefined) {
          replacement = mapped
        }
      }
    }
    else {
      const char = selectors[cursor]!
      const mapped = hasOwnKey(map, char) ? map[char] : undefined

      if (mapped !== undefined) {
        replacement = mapped
      }
      else if (isHead) {
        const nextIndex = cursor + size
        const next = nextIndex < length ? readCodePoint(selectors, nextIndex) : undefined
        const nextChar = next
          ? selectors.slice(nextIndex, nextIndex + next.size)
          : undefined
        const escapedHead = escapeLeadingCharacter(char, nextChar, ignoreHead)
        if (escapedHead !== char) {
          replacement = escapedHead
        }
      }
    }

    if (replacement !== undefined) {
      if (!buffer) {
        buffer = []
      }
      if (lastUnchangedIndex !== cursor) {
        buffer.push(selectors.slice(lastUnchangedIndex, cursor))
      }
      buffer.push(replacement)
      lastUnchangedIndex = cursor + size
    }

    cursor += size
  }

  if (!buffer) {
    return selectors
  }

  if (lastUnchangedIndex < length) {
    buffer.push(selectors.slice(lastUnchangedIndex))
  }

  return buffer.join('')
}
