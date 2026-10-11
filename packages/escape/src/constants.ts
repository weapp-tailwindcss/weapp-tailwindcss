export const SYMBOL_TABLE = {
  BACKQUOTE: '`',
  TILDE: '~',
  EXCLAM: '!',
  AT: '@',
  NUMBERSIGN: '#',
  DOLLAR: '$',
  PERCENT: '%',
  CARET: '^',
  AMPERSAND: '&',
  ASTERISK: '*',
  PARENLEFT: '(',
  PARENRIGHT: ')',
  MINUS: '-',
  UNDERSCORE: '_',
  EQUAL: '=',
  PLUS: '+',
  BRACKETLEFT: '[',
  BRACELEFT: '{',
  BRACKETRIGHT: ']',
  BRACERIGHT: '}',
  SEMICOLON: ';',
  COLON: ':',
  QUOTE: '\'',
  DOUBLEQUOTE: '"',
  BACKSLASH: '\\',
  BAR: '|',
  COMMA: ',',
  LESS: '<',
  PERIOD: '.',
  GREATER: '>',
  SLASH: '/',
  QUESTION: '?',
  SPACE: ' ',
  DOT: '.',
  HASH: '#',
} as const

export type SYMBOL_TABLE_TYPE = typeof SYMBOL_TABLE

export type SYMBOL_TABLE_TYPE_VALUES = SYMBOL_TABLE_TYPE[keyof SYMBOL_TABLE_TYPE]

export type MappingStringDictionary = Record<Exclude<SYMBOL_TABLE_TYPE_VALUES, '-' | '_' | ' '>, string>

// 需要转义的 ASCII 区间：32–47、58–64、91–96、123–126（排除 '-'、'_' 与空格）。
// 这些符号会干扰类名或 ID，统一处理可以兼顾大小写敏感的选择器。
const ESCAPE_CHARACTER_CODES = [
  ['[', 'b'],
  [']', 'B'],
  ['(', 'p'],
  [')', 'P'],
  ['#', 'h'],
  ['!', 'e'],
  ['/', 'f'],
  ['\\', 'r'],
  ['.', 'd'],
  [':', 'c'],
  ['%', 'v'],
  [',', 'm'],
  ['\'', 'a'],
  ['"', 'q'],
  ['*', 'x'],
  ['&', 'n'],
  ['@', 't'],
  ['{', 'k'],
  ['}', 'K'],
  ['+', 'u'],
  [';', 'j'],
  ['<', 'l'],
  ['~', 'w'],
  ['=', 'z'],
  ['>', 'g'],
  ['?', 'Q'],
  ['^', 'y'],
  ['`', 'i'],
  ['|', 'o'],
  ['$', 's'],
] as const satisfies ReadonlyArray<[Exclude<SYMBOL_TABLE_TYPE_VALUES, '-' | '_' | ' '>, string]>

function buildMapping(prefix: string) {
  return ESCAPE_CHARACTER_CODES.reduce<Record<string, string>>((acc, [char, code]) => {
    acc[char] = `${prefix}${code}`
    return acc
  }, {})
}

const SIMPLE_TOKEN_PREFIX = '_'
const COMPLEX_TOKEN_PREFIX = '_c'

// 复杂映射采用更长的标记，确保在外部系统中也能安全反解。
export const ComplexMappingChars2String: MappingStringDictionary = buildMapping(COMPLEX_TOKEN_PREFIX) as MappingStringDictionary

export const ComplexMappingChars2StringEntries = Object.entries(ComplexMappingChars2String)

// 简单映射追求更短的标记，适合对体积敏感的类名（如 Tailwind 用例）。
export const MappingChars2String: MappingStringDictionary = buildMapping(SIMPLE_TOKEN_PREFIX) as MappingStringDictionary

export const MappingChars2StringEntries = Object.entries(MappingChars2String)

export const MAX_ASCII_CHAR_CODE = 127
