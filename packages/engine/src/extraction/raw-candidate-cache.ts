import type { SourceEntry } from '@tailwindcss/oxide'
import type { ExtractCandidateOptions } from './types.ts'
import { promises as fs } from 'node:fs'
import process from 'node:process'

const DEFAULT_RAW_CANDIDATE_CACHE_LIMIT = 64
export function resolveRawCandidateCacheLimit(rawLimit: string | undefined) {
  if (rawLimit === undefined) {
    return DEFAULT_RAW_CANDIDATE_CACHE_LIMIT
  }
  const limit = Number.parseInt(rawLimit, 10)
  return Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_RAW_CANDIDATE_CACHE_LIMIT
}

const RAW_CANDIDATE_CACHE_LIMIT = resolveRawCandidateCacheLimit(process.env['TWM_ENGINE_RAW_CANDIDATE_CACHE_LIMIT'])

const rawCandidateCache = new Map<string, {
  fingerprint: string
  candidates: string[]
}>()

export function createRawCandidateCacheKey(sources: SourceEntry[] | undefined, options?: ExtractCandidateOptions) {
  return JSON.stringify({
    sources: sources ?? null,
    bareArbitraryValues: options?.bareArbitraryValues ?? null,
  })
}

export async function createRawCandidateFileFingerprint(files: string[] | undefined) {
  if (!files?.length) {
    return ''
  }

  const entries = await Promise.all(files.map(async (file) => {
    try {
      const stats = await fs.stat(file)
      return `${file}:${stats.size}:${stats.mtimeMs}`
    }
    catch {
      return `${file}:missing`
    }
  }))
  return entries.sort().join('|')
}

export function getRawCandidateCacheEntry(cacheKey: string, fingerprint: string) {
  const cached = rawCandidateCache.get(cacheKey)
  if (cached?.fingerprint !== fingerprint) {
    return undefined
  }
  rawCandidateCache.delete(cacheKey)
  rawCandidateCache.set(cacheKey, cached)
  return cached
}

export function setRawCandidateCacheEntry(cacheKey: string, fingerprint: string, candidates: string[]) {
  rawCandidateCache.set(cacheKey, {
    fingerprint,
    candidates,
  })

  while (rawCandidateCache.size > RAW_CANDIDATE_CACHE_LIMIT) {
    const oldestKey = rawCandidateCache.keys().next().value
    if (oldestKey === undefined) {
      break
    }
    rawCandidateCache.delete(oldestKey)
  }
}
