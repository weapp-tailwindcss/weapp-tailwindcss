import { splitCandidateTokens } from '@weapp-tailwindcss/engine'

const MUSTACHE_EXPRESSION_RE = /\{\{[\s\S]*?\}\}/g
const QUOTED_LITERAL_RE = /'([^']*)'|"([^"]*)"|`([^`]*)`/g
const CLASS_ATTRIBUTE_RE = /\bclass\s*=\s*/g
const MUSTACHE_OPEN = '{{'
const MUSTACHE_CLOSE = '}}'

function isUrlLikeCandidate(candidate: string) {
  return candidate.startsWith('//')
    || candidate.startsWith('http://')
    || candidate.startsWith('https://')
}

function isArbitraryValueCandidate(candidate: string) {
  return candidate.includes('[')
    && candidate.includes(']')
    && !isUrlLikeCandidate(candidate.trim())
}

function collectClassAttributeValues(source: string) {
  const values: string[] = []
  CLASS_ATTRIBUTE_RE.lastIndex = 0
  let matched = CLASS_ATTRIBUTE_RE.exec(source)

  while (matched !== null) {
    const quoteIndex = CLASS_ATTRIBUTE_RE.lastIndex
    const quote = source[quoteIndex]
    if (quote !== '"' && quote !== '\'') {
      matched = CLASS_ATTRIBUTE_RE.exec(source)
      continue
    }

    let expressionDepth = 0
    for (let index = quoteIndex + 1; index < source.length; index++) {
      if (source.startsWith(MUSTACHE_OPEN, index)) {
        expressionDepth++
        index += MUSTACHE_OPEN.length - 1
        continue
      }
      if (expressionDepth > 0 && source.startsWith(MUSTACHE_CLOSE, index)) {
        expressionDepth--
        index += MUSTACHE_CLOSE.length - 1
        continue
      }
      if (expressionDepth === 0 && source[index] === quote) {
        values.push(source.slice(quoteIndex + 1, index))
        CLASS_ATTRIBUTE_RE.lastIndex = index + 1
        break
      }
    }

    matched = CLASS_ATTRIBUTE_RE.exec(source)
  }

  return values
}

export function collectUnescapedDynamicCandidates(
  source: string,
  allowedCandidates?: Set<string>,
) {
  const matches = new Set<string>()
  const shouldFilterByAllowedCandidates = allowedCandidates !== undefined && allowedCandidates.size > 0

  for (const classValue of collectClassAttributeValues(source)) {
    for (const expression of classValue.match(MUSTACHE_EXPRESSION_RE) ?? []) {
      QUOTED_LITERAL_RE.lastIndex = 0
      let quoted = QUOTED_LITERAL_RE.exec(expression)
      while (quoted !== null) {
        const literal = quoted[1] ?? quoted[2] ?? quoted[3] ?? ''
        for (const candidate of splitCandidateTokens(literal)) {
          const normalized = candidate.trim()
          if (!normalized || !isArbitraryValueCandidate(normalized)) {
            continue
          }
          if (shouldFilterByAllowedCandidates && !allowedCandidates.has(normalized)) {
            continue
          }
          matches.add(normalized)
        }
        quoted = QUOTED_LITERAL_RE.exec(expression)
      }
    }
  }

  return [...matches]
}
