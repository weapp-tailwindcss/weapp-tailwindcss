import { MAX_ASCII_CHAR_CODE } from './constants'

const UNICODE_PREFIX = 'u_x'
const UNICODE_SUFFIX = '_'
const HEX_RADIX = 16

function isHexDigit(char: string) {
  const code = char.codePointAt(0)!

  return (
    (code >= 48 && code <= 57)
    || (code >= 65 && code <= 70)
    || (code >= 97 && code <= 102)
  )
}

export interface DecodedUnicodeSequence {
  char: string
  length: number
}

export function decodeUnicodeSequence(value: string, index: number): DecodedUnicodeSequence | undefined {
  if (!value.startsWith(UNICODE_PREFIX, index)) {
    return undefined
  }

  let cursor = index + UNICODE_PREFIX.length
  while (cursor < value.length) {
    const nextChar = value[cursor]
    if (!nextChar || !isHexDigit(nextChar)) {
      break
    }
    cursor += 1
  }

  if (cursor === index + UNICODE_PREFIX.length) {
    return undefined
  }

  if (cursor >= value.length || value[cursor] !== UNICODE_SUFFIX) {
    return undefined
  }

  const hex = value.slice(index + UNICODE_PREFIX.length, cursor)
  const codePoint = Number.parseInt(hex, HEX_RADIX)

  if (Number.isNaN(codePoint) || codePoint <= MAX_ASCII_CHAR_CODE || codePoint > 0x10FFFF) {
    return undefined
  }

  return {
    char: String.fromCodePoint(codePoint),
    length: cursor - index + 1,
  }
}
