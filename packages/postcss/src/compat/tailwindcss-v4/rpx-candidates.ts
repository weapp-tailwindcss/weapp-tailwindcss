const RPX_LENGTH_UTILITY_PATTERN = String.raw`text|border(?:-[trblxyse])?|bg|outline|ring`
const BARE_RPX_LENGTH_CANDIDATE_RE = new RegExp(
  String.raw`(^|:)(!?)(${RPX_LENGTH_UTILITY_PATTERN})-\[([-+]?(?:\d+|\d*\.\d+)rpx)\](.*)$`,
  'u',
)
const BARE_RPX_LENGTH_HINT_CANDIDATE_RE = new RegExp(
  String.raw`(?:^|:)!?(${RPX_LENGTH_UTILITY_PATTERN})-\[length:([-+]?(?:\d+|\d*\.\d+)rpx)\].*$`,
  'u',
)
const RPX_LENGTH_SELECTOR_RE = new RegExp(
  String.raw`(${RPX_LENGTH_UTILITY_PATTERN})-\\\[length\\:((?:\\[.+-]|[+\-.\d])+rpx)\\\]`,
  'g',
)

function normalizeRpxLengthCandidate(candidate: string) {
  return candidate.replace(
    BARE_RPX_LENGTH_CANDIDATE_RE,
    (_match, prefix: string, important: string, utility: string, value: string, suffix: string) => {
      return `${prefix}${important}${utility}-[length:${value}]${suffix}`
    },
  )
}

export function normalizeRpxLengthCandidates(candidates: Iterable<string>) {
  const normalized = new Set<string>()
  const restoreCandidates = new Map<string, string>()
  for (const candidate of candidates) {
    const normalizedCandidate = normalizeRpxLengthCandidate(candidate)
    normalized.add(normalizedCandidate)
    if (normalizedCandidate !== candidate) {
      restoreCandidates.set(normalizedCandidate, candidate)
    }
  }
  return {
    candidates: normalized,
    restoreCandidates,
  }
}

export function restoreRpxLengthCandidates(candidates: Iterable<string>, restoreCandidates: ReadonlyMap<string, string>) {
  if (restoreCandidates.size === 0) {
    return new Set(candidates)
  }
  return new Set([...candidates].map(candidate => restoreCandidates.get(candidate) ?? candidate))
}

function normalizeCssEscapedRpxSelectorValue(value: string) {
  return value.replace(/\\([.+-])/g, '$1')
}

export function restoreRpxLengthCssSelectors(css: string, restoreCandidates: ReadonlyMap<string, string>) {
  if (restoreCandidates.size === 0 || !css.includes('\\[length\\:')) {
    return css
  }
  const restoredUtilities = new Set(
    [...restoreCandidates.keys()]
      .map((candidate) => {
        const match = BARE_RPX_LENGTH_HINT_CANDIDATE_RE.exec(candidate)
        return match ? `${match[1]}:${match[2]}` : undefined
      })
      .filter((value): value is string => Boolean(value)),
  )
  return css.replace(RPX_LENGTH_SELECTOR_RE, (match, utility: string, value: string) => {
    return restoredUtilities.has(`${utility}:${normalizeCssEscapedRpxSelectorValue(value)}`)
      ? `${utility}-\\[${value}\\]`
      : match
  })
}
