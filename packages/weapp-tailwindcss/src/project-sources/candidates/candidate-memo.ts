import type { SourceCandidateCollectorOptions } from './types-and-cache'
import { cleanUrl, createSourceCandidateContentCacheKey, extractCandidates, sourceCandidateContentCache } from './types-and-cache'

const SOURCE_CANDIDATE_FILE_MEMO_MAX = 4096

interface FileCandidateMemo {
  extension: string
  source: string
  candidates: Set<string>
}

export function createCandidateMemo(options: SourceCandidateCollectorOptions) {
  const fileCandidateMemo = new Map<string, FileCandidateMemo>()

  async function resolveCandidates(id: string, source: string, extension: string, owner: { active: boolean }) {
    const normalizedId = cleanUrl(id)
    const memoKey = `${normalizedId}\0${extension}`
    const memo = fileCandidateMemo.get(memoKey)
    if (memo?.source === source) {
      return new Set(memo.candidates)
    }
    const contentCacheKey = createSourceCandidateContentCacheKey(
      extension,
      source,
      options.bareArbitraryValues,
      options.customAttributesEntities,
      options.disabledDefaultTemplateHandler,
      options.extractor,
    )
    const cachedCandidates = sourceCandidateContentCache.get(contentCacheKey)
    const nextCandidates = cachedCandidates
      ? new Set(cachedCandidates)
      : await extractCandidates(source, extension, options)
    if (!cachedCandidates) {
      sourceCandidateContentCache.set(contentCacheKey, [...nextCandidates])
    }
    if (!owner.active) {
      return new Set<string>()
    }
    fileCandidateMemo.delete(memoKey)
    fileCandidateMemo.set(memoKey, {
      candidates: new Set(nextCandidates),
      extension,
      source,
    })
    while (fileCandidateMemo.size > SOURCE_CANDIDATE_FILE_MEMO_MAX) {
      const oldest = fileCandidateMemo.keys().next().value
      if (oldest === undefined) {
        break
      }
      fileCandidateMemo.delete(oldest)
    }
    return new Set(nextCandidates)
  }

  return {
    resolveCandidates,
    get size() { return fileCandidateMemo.size },
    clear: () => fileCandidateMemo.clear(),
    remove(id: string) {
      for (const key of fileCandidateMemo.keys()) {
        if (key.startsWith(`${id}\0`)) {
          fileCandidateMemo.delete(key)
        }
      }
    },
  }
}
