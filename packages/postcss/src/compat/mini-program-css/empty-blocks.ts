import postcss from 'postcss'
import { normalizeClassPresenceSelectors } from './class-presence'
import { repairTrailingUnclosedTailwindSourceMedia } from './directives'
import { removeEmptyAtRules, removeEmptyRules } from './root-cleanups'

function isCssWhitespace(code: number) {
  return code === 9 || code === 10 || code === 12 || code === 13 || code === 32
}

function isCssWordChar(code: number) {
  return (code >= 48 && code <= 57)
    || (code >= 65 && code <= 90)
    || (code >= 97 && code <= 122)
    || code === 95
}

// 先用原生正则排除绝大多数不含空块的 CSS，避免每次 HMR 都逐字符扫描完整产物。
const EMPTY_CSS_BLOCK_RE = /\{(?:[\t\n\f\r ]|\/\*(?:[^*]|\*(?!\/))*\*\/)*\}/

function findCssPreludeStart(css: string, start: number, end: number) {
  let cursor = start
  while (cursor < end) {
    while (cursor < end && isCssWhitespace(css.charCodeAt(cursor))) {
      cursor++
    }
    if (css.charCodeAt(cursor) !== 47 || css.charCodeAt(cursor + 1) !== 42) {
      return cursor
    }
    const commentEnd = css.indexOf('*/', cursor + 2)
    if (commentEnd < 0 || commentEnd + 2 > end) {
      return end
    }
    cursor = commentEnd + 2
  }
  return end
}

function isKeyframesAtRule(css: string, start: number, end: number) {
  let cursor = start + 1
  if (css.charCodeAt(cursor) === 45) {
    cursor++
    const prefixStart = cursor
    while (cursor < end && isCssWordChar(css.charCodeAt(cursor))) {
      cursor++
    }
    if (cursor === prefixStart || css.charCodeAt(cursor) !== 45) {
      return false
    }
    cursor++
  }
  if (cursor + 9 > end || css.slice(cursor, cursor + 9).toLowerCase() !== 'keyframes') {
    return false
  }
  const next = css.charCodeAt(cursor + 9)
  return !isCssWordChar(next)
}

export function hasEmptyCssBlockCandidate(css: string) {
  if (!EMPTY_CSS_BLOCK_RE.test(css)) {
    return false
  }
  const blocks: Array<{
    hasContent: boolean
    isKeyframesContainer: boolean
    isKeyframeStep: boolean
  }> = []
  let parenthesisDepth = 0
  let quote = 0
  let squareBracketDepth = 0
  let statementStart = 0
  for (let index = 0; index < css.length; index++) {
    const code = css.charCodeAt(index)
    if (quote !== 0) {
      if (code === 92) {
        index++
      }
      else if (code === quote) {
        quote = 0
      }
      continue
    }
    if (code === 34 || code === 39) {
      quote = code
      if (blocks.length > 0) {
        blocks[blocks.length - 1].hasContent = true
      }
      continue
    }
    if (code === 92) {
      if (blocks.length > 0) {
        blocks[blocks.length - 1].hasContent = true
      }
      index++
      continue
    }
    if (code === 47 && css.charCodeAt(index + 1) === 42) {
      const commentEnd = css.indexOf('*/', index + 2)
      if (commentEnd < 0) {
        return false
      }
      index = commentEnd + 1
      continue
    }
    if (code === 40) {
      parenthesisDepth++
      continue
    }
    if (code === 41 && parenthesisDepth > 0) {
      parenthesisDepth--
      continue
    }
    if (code === 91) {
      squareBracketDepth++
      continue
    }
    if (code === 93 && squareBracketDepth > 0) {
      squareBracketDepth--
      continue
    }
    if (code === 123 && parenthesisDepth === 0 && squareBracketDepth === 0) {
      const preludeStart = findCssPreludeStart(css, statementStart, index)
      const isAtRule = css.charCodeAt(preludeStart) === 64
      const isKeyframesContainer = isAtRule && isKeyframesAtRule(css, preludeStart, index)
      blocks.push({
        hasContent: false,
        isKeyframesContainer,
        isKeyframeStep: !isAtRule && blocks[blocks.length - 1]?.isKeyframesContainer === true,
      })
      statementStart = index + 1
      continue
    }
    if (code === 125 && parenthesisDepth === 0 && squareBracketDepth === 0) {
      const block = blocks.pop()
      if (!block) {
        continue
      }
      if (!block.hasContent && !block.isKeyframeStep) {
        return true
      }
      if (blocks.length > 0) {
        blocks[blocks.length - 1].hasContent = true
      }
      statementStart = index + 1
      continue
    }
    if (code === 59 && parenthesisDepth === 0 && squareBracketDepth === 0) {
      statementStart = index + 1
      continue
    }
    if (!isCssWhitespace(code) && blocks.length > 0) {
      blocks[blocks.length - 1].hasContent = true
    }
  }
  return false
}

/** 在小程序样式进入最终产物图时规范化等价选择器并递归清理空 CSS 块。 */
export function finalizeMiniProgramCssStructure(css: string) {
  const repaired = repairTrailingUnclosedTailwindSourceMedia(css)
  if (!/\[\s*class\s*\]/.test(repaired) && !hasEmptyCssBlockCandidate(repaired)) {
    return repaired
  }
  try {
    const root = postcss.parse(repaired)
    const selectorsChanged = normalizeClassPresenceSelectors(root)
    let removed = 0
    let passRemoved = 0
    do {
      passRemoved = removeEmptyRules(root) + removeEmptyAtRules(root)
      removed += passRemoved
    } while (passRemoved > 0)
    return removed > 0 || selectorsChanged ? root.toString() : repaired
  }
  catch {
    return repaired
  }
}
