import type { BareArbitraryValueOptions } from './bare-arbitrary-values.ts'
import type { TailwindV4DesignSystem } from './types.ts'
import postcss from 'postcss'
import { escapeCssClassName, resolveBareArbitraryValueCandidate } from './bare-arbitrary-values.ts'

export function resolveValidTailwindV4Candidates(
  designSystem: TailwindV4DesignSystem,
  candidates: Iterable<string>,
  options?: {
    bareArbitraryValues?: boolean | BareArbitraryValueOptions
  },
): Set<string> {
  const validCandidates = new Set<string>()
  const parsedCandidates: string[] = []
  const originalCandidatesByCanonical = new Map<string, Set<string>>()

  for (const candidate of candidates) {
    if (!candidate) {
      continue
    }

    const bareArbitrary = resolveBareArbitraryValueCandidate(candidate, options?.bareArbitraryValues)
    const candidateToCheck = bareArbitrary?.canonicalCandidate ?? candidate

    if (bareArbitrary) {
      const originalCandidates = originalCandidatesByCanonical.get(candidateToCheck) ?? new Set<string>()
      originalCandidates.add(candidate)
      originalCandidatesByCanonical.set(candidateToCheck, originalCandidates)
    }

    const alreadyParsed = parsedCandidates.includes(candidateToCheck)
    if (alreadyParsed) {
      continue
    }

    if (designSystem.parseCandidate(candidateToCheck).length > 0) {
      parsedCandidates.push(candidateToCheck)
    }
  }

  if (parsedCandidates.length === 0) {
    return validCandidates
  }

  const cssByCandidate = designSystem.candidatesToCss(parsedCandidates)
  for (let index = 0; index < parsedCandidates.length; index++) {
    const candidate = parsedCandidates[index]
    const candidateCss = cssByCandidate[index]
    if (candidate && typeof candidateCss === 'string' && candidateCss.trim().length > 0) {
      const originalCandidates = originalCandidatesByCanonical.get(candidate)
      if (originalCandidates) {
        for (const originalCandidate of originalCandidates) {
          validCandidates.add(originalCandidate)
        }
        continue
      }
      validCandidates.add(candidate)
    }
  }

  return validCandidates
}

function createSelectorAliasMap(
  candidates: Iterable<string>,
  options?: boolean | BareArbitraryValueOptions,
) {
  const aliases = new Map<string, Set<string>>()
  for (const candidate of candidates) {
    const bareArbitrary = resolveBareArbitraryValueCandidate(candidate, options)
    if (!bareArbitrary) {
      continue
    }
    const canonicalSelector = escapeCssClassName(bareArbitrary.canonicalCandidate)
    const bareSelectors = aliases.get(canonicalSelector) ?? new Set<string>()
    bareSelectors.add(escapeCssClassName(bareArbitrary.candidate))
    aliases.set(canonicalSelector, bareSelectors)
  }
  return aliases
}

export function replaceBareArbitraryValueSelectors(
  css: string,
  candidates: Iterable<string>,
  options?: boolean | BareArbitraryValueOptions,
) {
  const aliases = createSelectorAliasMap(candidates, options)
  if (aliases.size === 0) {
    return css
  }

  if (Array.from(aliases.values()).every(bareSelectors => bareSelectors.size === 1)) {
    let result = css
    for (const [canonicalSelector, bareSelectors] of aliases) {
      const bareSelector = Array.from(bareSelectors)[0]
      if (bareSelector !== undefined) {
        result = result.replaceAll(canonicalSelector, bareSelector)
      }
    }
    return result
  }

  const root = postcss.parse(css)
  root.walkRules((rule) => {
    let selectors = rule.selectors
    for (const [canonicalSelector, bareSelectors] of aliases) {
      selectors = selectors.flatMap((selector) => {
        if (!selector.includes(canonicalSelector)) {
          return selector
        }
        return Array.from(bareSelectors, bareSelector => selector.replaceAll(canonicalSelector, bareSelector))
      })
    }
    rule.selectors = selectors
  })
  return root.toString()
}

export function canonicalizeBareArbitraryValueCandidates(
  candidates: Iterable<string>,
  options?: boolean | BareArbitraryValueOptions,
) {
  return Array.from(candidates, (candidate) => {
    const bareArbitrary = resolveBareArbitraryValueCandidate(candidate, options)
    return bareArbitrary?.canonicalCandidate ?? candidate
  })
}

export { extractTailwindV4InlineSourceCandidates } from './candidates/inline-source.ts'
