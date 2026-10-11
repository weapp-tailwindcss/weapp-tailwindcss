import type { BareArbitraryValueOptions, BareArbitraryValueSourceCandidate } from './types.ts'
import { isBareArbitraryValuesEnabled, resolveBareArbitraryValueCandidate } from './resolve.ts'

const ESCAPED_WHITESPACE_RE = /\\[nrt]/g

function isBareArbitrarySourceSplitter(char: string) {
  return /\s/.test(char)
}

function isQuoteBoundary(content: string, start: number, index: number) {
  const tokenPrefix = content.slice(start, index)
  return tokenPrefix.length === 0 || !tokenPrefix.endsWith('-')
}

function trimBareArbitrarySourceToken(token: string, start: number) {
  let nextToken = token
  let nextStart = start
  while (nextToken.length > 0 && /^[<{([]$/.test(nextToken[0]!)) {
    nextToken = nextToken.slice(1)
    nextStart++
  }
  while (nextToken.length > 0 && /^[>\],;]$/.test(nextToken[nextToken.length - 1]!)) {
    nextToken = nextToken.slice(0, -1)
  }
  return {
    token: nextToken,
    start: nextStart,
  }
}

function pushBareArbitrarySourceCandidate(
  result: BareArbitraryValueSourceCandidate[],
  token: string,
  start: number,
  options: boolean | BareArbitraryValueOptions | undefined,
) {
  const trimmed = trimBareArbitrarySourceToken(token, start)
  if (!trimmed.token || trimmed.token.includes('=') || trimmed.token.includes('[') || trimmed.token.includes(']')) {
    return
  }
  if (!resolveBareArbitraryValueCandidate(trimmed.token, options)) {
    return
  }
  result.push({
    rawCandidate: trimmed.token,
    start: trimmed.start,
    end: trimmed.start + trimmed.token.length,
  })
}

export function extractBareArbitraryValueSourceCandidatesWithPositions(
  content: string,
  options?: boolean | BareArbitraryValueOptions,
): BareArbitraryValueSourceCandidate[] {
  if (!isBareArbitraryValuesEnabled(options)) {
    return []
  }

  const normalized = content.includes('\\') ? content.replace(ESCAPED_WHITESPACE_RE, ' ') : content
  const result: BareArbitraryValueSourceCandidate[] = []
  let depth = 0
  let quote: string | undefined
  let start = 0

  for (let index = 0; index < normalized.length; index++) {
    const char = normalized[index]
    if (char === undefined) {
      continue
    }
    if (char === '\\') {
      index++
      continue
    }

    if (quote) {
      if (char === quote) {
        quote = undefined
      }
    }
    else if ((char === '"' || char === '\'' || char === '`') && !isQuoteBoundary(normalized, start, index)) {
      quote = char
    }
    else if (char === '(' || char === '{' || char === '[') {
      depth++
    }
    else if (char === ')' || char === '}' || char === ']') {
      depth = Math.max(0, depth - 1)
    }

    if (!isBareArbitrarySourceSplitter(char) && !((char === '"' || char === '\'' || char === '`') && depth === 0 && isQuoteBoundary(normalized, start, index))) {
      continue
    }

    pushBareArbitrarySourceCandidate(result, normalized.slice(start, index), start, options)
    start = index + 1
  }

  pushBareArbitrarySourceCandidate(result, normalized.slice(start), start, options)
  return result
}

export function extractBareArbitraryValueSourceCandidates(
  content: string,
  options?: boolean | BareArbitraryValueOptions,
) {
  return [...new Set(
    extractBareArbitraryValueSourceCandidatesWithPositions(content, options)
      .map(candidate => candidate.rawCandidate),
  )]
}
