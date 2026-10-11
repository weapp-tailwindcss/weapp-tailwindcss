import { postcss } from '../postcss-runtime'

export interface CssTokenSource {
  token: string
  sources: string[]
}

export type CssTokenSourceMap = Map<string, CssTokenSource>

const CSS_SOURCE_TRACE_COMMENT_RE = /^\s*tokens:\s/
const TAILWIND_GENERATED_CONTAINER_TRACE_COMMENT_RE = /^\s*tokens:\s*container\s*<=\s*<tailwind generated>\s*$/i

function normalizeSelectorTokenCandidate(candidate: string) {
  return candidate
    .replace(/(?<!\\)\\:/g, ':')
    .replace(/(?<!\\)\\\//g, '/')
}

function getTokenSource(tokenSources: CssTokenSourceMap, token: string) {
  return tokenSources.get(token)
}

function collectRuleSourceTokens(rule: postcss.Rule, tokenSources: CssTokenSourceMap) {
  const tokens = new Map<string, CssTokenSource>()
  for (const selector of rule.selectors) {
    const classMatches = selector.matchAll(/\.((?:\\.|[^\s.#:[{>,])*)/g)
    for (const match of classMatches) {
      const rawCandidate = match[1]
      if (!rawCandidate) {
        continue
      }
      const candidates = [
        normalizeSelectorTokenCandidate(rawCandidate),
        rawCandidate,
      ]
      for (const candidate of candidates) {
        const source = getTokenSource(tokenSources, candidate)
        if (!source) {
          continue
        }
        tokens.set(source.token, source)
        break
      }
    }
  }
  return tokens
}

function removeTracedTailwindGeneratedContainerRules(root: postcss.Root) {
  root.walkRules((rule) => {
    if (!rule.selectors || rule.selectors.length !== 1 || rule.selectors[0] !== '.container') {
      return
    }
    const previous = rule.prev()
    if (previous?.type !== 'comment' || !TAILWIND_GENERATED_CONTAINER_TRACE_COMMENT_RE.test(previous.text)) {
      return
    }
    previous.remove()
    rule.remove()
  })
}

function normalizeTraceCommentBefore(value: string | undefined) {
  return value?.includes('\n') ? value : '\n'
}

export function annotateCssTokenSources(
  css: string,
  tokenSources: CssTokenSourceMap,
) {
  if (!tokenSources.size) {
    return css
  }

  try {
    const root = postcss.parse(css)
    root.walkComments((comment) => {
      if (CSS_SOURCE_TRACE_COMMENT_RE.test(comment.text)) {
        comment.remove()
      }
    })
    root.walkRules((rule) => {
      const tokens = collectRuleSourceTokens(rule, tokenSources)
      if (tokens.size === 0 || !rule.parent) {
        return
      }
      const lines = [...tokens.values()].map(({ token, sources }) => {
        return `${token} <= ${sources.length > 0 ? sources.join(', ') : '<tailwind generated>'}`
      })
      const comment = postcss.comment({ text: `tokens: ${lines.join(' | ')}` })
      comment.raws.before = normalizeTraceCommentBefore(rule.raws.before)
      rule.raws.before = '\n'
      rule.parent.insertBefore(rule, comment)
    })
    removeTracedTailwindGeneratedContainerRules(root)
    return root.toString()
  }
  catch {
    return css
  }
}
