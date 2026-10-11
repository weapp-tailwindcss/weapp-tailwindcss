import type { SourceEntry } from '@tailwindcss/oxide'
import type { BareArbitraryValueOptions } from '../../v4/bare-arbitrary-values.ts'
import type { TailwindV4DesignSystem } from '../../v4/types.ts'
import process from 'node:process'
import { resolveBareArbitraryValueCandidate } from '../../v4/bare-arbitrary-values.ts'
import { extractTailwindV4InlineSourceCandidates, resolveValidTailwindV4Candidates } from '../../v4/candidates.ts'
import { loadTailwindV4DesignSystem } from '../../v4/node-adapter.ts'
import { extractRawCandidates } from './raw.ts'

const designSystemCandidateCache = new WeakMap<TailwindV4DesignSystem, Map<string, Map<string, boolean>>>()

export interface ExtractValidCandidatesOption {
  sources?: SourceEntry[]
  base?: string
  baseFallbacks?: string[]
  css?: string
  cwd?: string
  bareArbitraryValues?: boolean | BareArbitraryValueOptions
}

function createCandidateCacheKey(
  options: Pick<ExtractValidCandidatesOption, 'bareArbitraryValues'>,
) {
  if (options.bareArbitraryValues == null || options.bareArbitraryValues === false) {
    return 'default'
  }
  return `bare-arbitrary:${JSON.stringify(options.bareArbitraryValues)}`
}

export async function extractValidCandidates(options?: ExtractValidCandidatesOption) {
  const providedOptions = options ?? {}
  const defaultCwd = providedOptions.cwd ?? process.cwd()

  const base = providedOptions.base ?? defaultCwd
  const baseFallbacks = providedOptions.baseFallbacks ?? []
  const css = providedOptions.css ?? '@import "tailwindcss";'
  const sources = (providedOptions.sources ?? [
    {
      base: defaultCwd,
      pattern: '**/*',
      negated: false,
    },
  ]).map(source => ({
    base: source.base ?? defaultCwd,
    pattern: source.pattern,
    negated: source.negated,
  }))

  const source = {
    projectRoot: defaultCwd,
    base,
    baseFallbacks,
    css,
    dependencies: [],
  }
  const designSystem = await loadTailwindV4DesignSystem(source)
  const candidateCacheKey = createCandidateCacheKey(providedOptions)
  const caches = designSystemCandidateCache.get(designSystem) ?? new Map<string, Map<string, boolean>>()
  designSystemCandidateCache.set(designSystem, caches)
  const candidateCache = caches.get(candidateCacheKey) ?? new Map<string, boolean>()
  caches.set(candidateCacheKey, candidateCache)

  const candidates = await extractRawCandidates(
    sources,
    providedOptions.bareArbitraryValues === undefined
      ? undefined
      : { bareArbitraryValues: providedOptions.bareArbitraryValues },
  )
  const inlineSources = extractTailwindV4InlineSourceCandidates(css)
  for (const candidate of inlineSources.included) {
    candidates.push(candidate)
  }
  for (const candidate of inlineSources.excluded) {
    let index = candidates.indexOf(candidate)
    while (index !== -1) {
      candidates.splice(index, 1)
      index = candidates.indexOf(candidate)
    }
  }
  const validCandidates: string[] = []
  const uncachedCandidates: string[] = []

  for (const rawCandidate of candidates) {
    const cached = candidateCache.get(rawCandidate)
    if (cached === true) {
      validCandidates.push(rawCandidate)
      continue
    }

    if (cached === false) {
      continue
    }

    const bareArbitrary = resolveBareArbitraryValueCandidate(rawCandidate, providedOptions.bareArbitraryValues)
    if (
      designSystem.parseCandidate(rawCandidate).length > 0
      || (bareArbitrary && designSystem.parseCandidate(bareArbitrary.canonicalCandidate).length > 0)
    ) {
      uncachedCandidates.push(rawCandidate)
      continue
    }

    candidateCache.set(rawCandidate, false)
  }

  if (uncachedCandidates.length === 0) {
    return validCandidates
  }

  const validUncachedCandidates = resolveValidTailwindV4Candidates(
    designSystem,
    uncachedCandidates,
    providedOptions.bareArbitraryValues === undefined
      ? undefined
      : { bareArbitraryValues: providedOptions.bareArbitraryValues },
  )

  for (const candidate of uncachedCandidates) {
    const isValid = validUncachedCandidates.has(candidate)
    candidateCache.set(candidate, isValid)
    if (!isValid) {
      continue
    }
    validCandidates.push(candidate)
  }

  return validCandidates
}
