import postcss from 'postcss'

export const TAILWIND_V4_BANNER_RE = /\/\*!\s*tailwindcss v4\./

const GENERATOR_PLACEHOLDER_COMMENT_RE = /^\s*(?:!\s*)?weapp-tailwindcss generator-placeholder\s*$/i

function isCssWhitespace(code: number) {
  return code === 9 || code === 10 || code === 12 || code === 13 || code === 32
}

function skipCssWhitespace(css: string, start: number) {
  let index = start
  while (index < css.length && isCssWhitespace(css.charCodeAt(index))) {
    index++
  }
  return index
}

function findClosingParenthesis(css: string, openingIndex: number) {
  let depth = 0
  let quote = 0
  for (let index = openingIndex; index < css.length; index++) {
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
      continue
    }
    if (code === 92) {
      index++
      continue
    }
    if (code === 47 && css.charCodeAt(index + 1) === 42) {
      const commentEnd = css.indexOf('*/', index + 2)
      if (commentEnd < 0) {
        return -1
      }
      index = commentEnd + 1
      continue
    }
    if (code === 40) {
      depth++
      continue
    }
    if (code === 41) {
      depth--
      if (depth === 0) {
        return index
      }
    }
  }
  return -1
}

function isCssCodePosition(css: string, position: number) {
  let quote = 0
  for (let index = 0; index < position; index++) {
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
      continue
    }
    if (code === 47 && css.charCodeAt(index + 1) === 42) {
      const commentEnd = css.indexOf('*/', index + 2)
      if (commentEnd < 0 || commentEnd >= position) {
        return false
      }
      index = commentEnd + 1
    }
  }
  return quote === 0
}

/**
 * 严格移除文件末尾残留的 Tailwind source media 开始标记。
 * 仅处理可确认属于 Tailwind 的尾部残片，其它非法 CSS 保持原样。
 */
export function repairTrailingUnclosedTailwindSourceMedia(css: string) {
  const sourceMediaPattern = /(?:^|\r?\n)[\t\f ]*@media\s+source\(/g
  for (let match = sourceMediaPattern.exec(css); match !== null; match = sourceMediaPattern.exec(css)) {
    const prefixLength = match[0].startsWith('\n')
      ? 1
      : match[0].startsWith('\r\n') ? 2 : 0
    const start = match.index + prefixLength
    if (!isCssCodePosition(css, start)) {
      continue
    }
    const openingIndex = start + match[0].length - prefixLength - 1
    const closingIndex = findClosingParenthesis(css, openingIndex)
    if (closingIndex < 0) {
      continue
    }
    const blockStart = skipCssWhitespace(css, closingIndex + 1)
    if (css.charCodeAt(blockStart) !== 123) {
      continue
    }
    const tailStart = skipCssWhitespace(css, blockStart + 1)
    if (tailStart !== css.length) {
      continue
    }
    return css.slice(0, match.index)
  }
  return css
}

export function hasTailwindcssV4Signal(css: string) {
  if (TAILWIND_V4_BANNER_RE.test(css)) {
    return true
  }
  const root = postcss.parse(css)
  let hasProperty = false
  root.walkAtRules('property', (atRule) => {
    if (atRule.params.trim().startsWith('--tw-')) {
      hasProperty = true
      return false
    }
  })
  return hasProperty
}

export function unwrapTailwindSourceMedia(root: postcss.Root) {
  root.walkAtRules('media', (atRule) => {
    if (!atRule.params.startsWith('source(')) {
      return
    }
    if (atRule.nodes && atRule.nodes.length > 0) {
      atRule.replaceWith(...atRule.nodes)
    }
    else {
      atRule.remove()
    }
  })
}

export function removeTailwindGenerationDirectives(root: postcss.Root) {
  root.walkComments((comment) => {
    if (GENERATOR_PLACEHOLDER_COMMENT_RE.test(comment.text)) {
      comment.remove()
    }
  })
  root.walkAtRules((atRule) => {
    if (
      atRule.name === 'config'
      || atRule.name === 'source'
      || atRule.name === 'tailwind'
      || atRule.name === 'reference'
      || atRule.name === 'plugin'
    ) {
      atRule.remove()
    }
  })
}
