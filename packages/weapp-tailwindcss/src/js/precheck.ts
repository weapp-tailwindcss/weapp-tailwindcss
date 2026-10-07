import type { IJsHandlerOptions } from '../types'
import process from 'node:process'
import { splitCandidateTokens } from '@weapp-tailwindcss/engine'
import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { decodeUnicode2 } from '../utils/decode'
import { isPlainClassNameSet } from './options-signature'
import { getReplacement } from './replacement-cache'

/** 用于检测源码中是否包含类名相关模式的正则表达式 */
const FAST_JS_TRANSFORM_HINT_RE = /className\b|class\s*=|classList\.|\b(?:twMerge|clsx|classnames|cn|cva)\b|\[["'`]class["'`]\]|text-\[|bg-\[|\b(?:[whpm]|px|py|mx|my|rounded|flex|grid|gap)-/

const DEFAULT_ESCAPE_CHARACTERS = new Set(Object.keys(MappingChars2String))
const CANDIDATE_SPLIT_HINT_RE = /\s|\\[nrt]/
const WHITESPACE_RE = /\s/
const customEscapeCharactersCache = new WeakMap<object, string[] | undefined>()
const escapeCharactersCache = new WeakMap<object, Set<string>>()

function getCustomEscapeCharacters(escapeMap: IJsHandlerOptions['escapeMap']) {
  if (!escapeMap || escapeMap === MappingChars2String) {
    return undefined
  }
  if (customEscapeCharactersCache.has(escapeMap)) {
    return customEscapeCharactersCache.get(escapeMap)
  }
  const customCharacters = Object.keys(escapeMap).filter(character => !DEFAULT_ESCAPE_CHARACTERS.has(character))
  const result = customCharacters.length > 0 ? customCharacters : undefined
  customEscapeCharactersCache.set(escapeMap, result)
  return result
}

function getEscapeCharacters(escapeMap: IJsHandlerOptions['escapeMap']) {
  if (!escapeMap || escapeMap === MappingChars2String) {
    return DEFAULT_ESCAPE_CHARACTERS
  }
  const cached = escapeCharactersCache.get(escapeMap)
  if (cached) {
    return cached
  }
  const characters = new Set([...DEFAULT_ESCAPE_CHARACTERS, ...Object.keys(escapeMap)])
  escapeCharactersCache.set(escapeMap, characters)
  return characters
}

function hasPotentialEscapeCharacter(literal: string, customEscapeCharacters?: string[]) {
  for (let index = 0; index < literal.length; index++) {
    const character = literal[index]!
    const code = literal.charCodeAt(index)
    if (code > 0x7F || DEFAULT_ESCAPE_CHARACTERS.has(character) || customEscapeCharacters?.includes(character)) {
      return true
    }
    const startsCandidate = index === 0 || WHITESPACE_RE.test(literal[index - 1]!)
    if (startsCandidate && ((code >= 0x30 && code <= 0x39)
      || (character === '-' && index + 1 < literal.length
        && literal.charCodeAt(index + 1) >= 0x30 && literal.charCodeAt(index + 1) <= 0x39))) {
      return true
    }
  }
  return false
}

/** 用于检测源码中是否包含 import/export/require 语句的正则表达式 */
const DEPENDENCY_HINT_RE = /\bimport\s*(?:["'`{]|\*\s+as\b)|\brequire\s*\(|\bexport\s+\*\s+from\s+["'`]|\bexport\s*\{[^}]*\}\s*from\s+["'`]/

/**
 * 读取源码中的引号片段。这里不尝试建立 JS AST，只为确认 classNameSet 是否可能命中。
 * 模板字符串按每一对反引号重叠扫描，插值中的嵌套模板也不会被漏掉；遇到未闭合
 * 引号时返回未知，调用方会保守地继续 AST 路径。
 */
function hasClassNameSetMatch(rawSource: string, options: IJsHandlerOptions) {
  const classNameSet = options.classNameSet
  if (!classNameSet || classNameSet.size === 0 || !isPlainClassNameSet(classNameSet)) {
    return true
  }

  const escapeMap = options.escapeMap
  const customEscapeCharacters = getCustomEscapeCharacters(escapeMap)
  const escapeCharacters = getEscapeCharacters(escapeMap)

  const hasEscapedClassNameMatch = (candidate: string) => {
    if (candidate.length === 0) {
      return false
    }

    let shouldEscape = false
    const firstCodePoint = candidate.codePointAt(0)
    if (firstCodePoint !== undefined) {
      shouldEscape = firstCodePoint > 0x7F
        || (firstCodePoint >= 0x30 && firstCodePoint <= 0x39)
        || (candidate[0] === '-' && candidate.length > 1 && candidate.charCodeAt(1) >= 0x30 && candidate.charCodeAt(1) <= 0x39)
    }

    if (!shouldEscape) {
      for (const character of candidate) {
        if (escapeCharacters.has(character)) {
          shouldEscape = true
          break
        }
      }
    }

    return shouldEscape && classNameSet.has(getReplacement(candidate, escapeMap))
  }

  const hasClassNameCandidate = (candidate: string) => classNameSet.has(candidate) || hasEscapedClassNameMatch(candidate)

  for (let index = 0; index < rawSource.length; index++) {
    const quote = rawSource[index]
    if (quote !== '"' && quote !== '\'' && quote !== '`') {
      continue
    }

    let end = index + 1
    let closed = false
    for (; end < rawSource.length; end++) {
      if (rawSource[end] === '\\') {
        end++
        continue
      }
      if (rawSource[end] === quote) {
        closed = true
        break
      }
    }
    if (!closed) {
      return true
    }

    const rawLiteral = rawSource.slice(index + 1, end)
    const literal = options.unescapeUnicode && rawLiteral.includes('\\u')
      ? decodeUnicode2(rawLiteral)
      : rawLiteral
    // 没有任何可能触发转义的字符时，除非整个字符串正好是集合成员，否则转换结果必然不变。
    // 这一步避免为普通业务字符串建立候选 token 数组。
    if (!hasPotentialEscapeCharacter(literal, customEscapeCharacters)) {
      if (classNameSet.has(literal)) {
        return true
      }
      if (quote !== '`') {
        index = end
      }
      continue
    }
    if (hasClassNameCandidate(literal)) {
      return true
    }
    if (CANDIDATE_SPLIT_HINT_RE.test(literal)) {
      for (const candidate of splitCandidateTokens(literal)) {
        if (hasClassNameCandidate(candidate)) {
          return true
        }
      }
    }

    // 单、双引号不会合法嵌套；跳到闭合位置可以保持大文件预检查线性。
    // 反引号允许插值中的嵌套模板，因此保留逐字符扫描以检查内层模板。
    if (quote !== '`') {
      index = end
    }
  }

  return false
}

/**
 * 判断源码是否可能声明跨模块依赖。
 *
 * 该检查只作为性能预筛：返回 `true` 时必须保守走 AST 模块图分析；
 * 返回 `false` 时源码中没有可被当前模块图消费的静态 import/export/require 形态。
 */
export function hasDependencyHint(rawSource: string): boolean {
  return DEPENDENCY_HINT_RE.test(rawSource)
}

/**
 * 判断是否可以跳过 JS 转换。
 * 通过正则快速检测源码内容，避免不必要的 Babel AST 解析。
 *
 * @param rawSource - 原始 JS 源码字符串
 * @param options - 可选的 JS 处理器配置选项
 * @returns 如果可以跳过转换返回 `true`，否则返回 `false`
 */
export function shouldSkipJsTransform(rawSource: string, options?: IJsHandlerOptions): boolean {
  if (process.env['WEAPP_TW_DISABLE_JS_PRECHECK'] === '1') {
    return false
  }
  if (!rawSource) {
    return true
  }
  if (options?.alwaysEscape) {
    return false
  }
  if (options?.moduleSpecifierReplacements && Object.keys(options.moduleSpecifierReplacements).length > 0) {
    return false
  }
  if (options?.wrapExpression) {
    return false
  }
  const classNameSet = options?.classNameSet
  let classNameSetMatch: boolean | undefined
  if (classNameSet && classNameSet.size > 0 && isPlainClassNameSet(classNameSet)) {
    classNameSetMatch = hasClassNameSetMatch(rawSource, options!)
    // 生产 bundle 没有 moduleGraph；没有集合成员命中时，静态依赖本身
    // 不会改变任何类名，可以直接跳过 AST。增量 moduleGraph 路径仍须
    // 保留依赖分析，避免漏掉被链接模块的更新。
    if (!classNameSetMatch && !options?.moduleGraph) {
      return true
    }
  }
  if (hasDependencyHint(rawSource)) {
    return false
  }
  if (classNameSetMatch !== undefined) {
    return !classNameSetMatch
  }
  return !FAST_JS_TRANSFORM_HINT_RE.test(rawSource)
}
