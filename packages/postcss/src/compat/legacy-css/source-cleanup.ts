import postcss from 'postcss'
import { removeTailwindApplyRules } from '../legacy-css'
import { removeUnsupportedMiniProgramAtRules } from '../mini-program-css'
import { removeTailwindSourceDirectives } from '../tailwindcss-v4/user-css/directives'
import { removeTailwindV4GeneratedUserCssArtifacts } from '../tailwindcss-v4/user-css/generated-cleanup'
import { stripTailwindBanners } from '../tailwindcss-v4/user-css/markers'

function countUnclosedBlocks(source: string) {
  let depth = 0
  let quote: string | undefined
  let inComment = false
  let escaped = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]

    if (inComment) {
      if (char === '*' && next === '/') {
        inComment = false
        index += 1
      }
      continue
    }

    if (quote) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === quote) {
        quote = undefined
      }
      continue
    }

    if (char === '/' && next === '*') {
      inComment = true
      index += 1
      continue
    }

    if (char === '"' || char === '\'') {
      quote = char
      continue
    }

    if (char === '{') {
      depth += 1
    }
    else if (char === '}' && depth > 0) {
      depth -= 1
    }
  }

  return depth
}

function closeTrailingUnclosedBlocks(source: string) {
  try {
    postcss.parse(source)
    return source
  }
  catch (error) {
    if ((error as { reason?: string }).reason !== 'Unclosed block') {
      return source
    }
    const unclosedBlocks = countUnclosedBlocks(source)
    return unclosedBlocks > 0 ? `${source}${'}'.repeat(unclosedBlocks)}` : source
  }
}

export function removeMiniProgramContainerCompatCss(css: string) {
  try {
    const root = postcss.parse(css)
    let removed = false
    root.walkRules((rule) => {
      if (rule.selectors?.length === 1 && rule.selectors[0] === '.container') {
        rule.remove()
        removed = true
      }
    })
    root.walkAtRules((atRule) => {
      if (atRule.nodes && atRule.nodes.length === 0) {
        atRule.remove()
        removed = true
      }
    })
    return removed ? root.toString() : css
  }
  catch {
    return css
  }
}

export function normalizeLegacyCompatCssSource(rawSource: string) {
  const parseableSource = closeTrailingUnclosedBlocks(stripTailwindBanners(rawSource))
  const source = removeTailwindSourceDirectives(parseableSource)
  return closeTrailingUnclosedBlocks(removeTailwindV4GeneratedUserCssArtifacts(removeUnsupportedMiniProgramAtRules(removeTailwindApplyRules(source))))
}
