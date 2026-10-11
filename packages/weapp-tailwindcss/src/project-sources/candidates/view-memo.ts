import type { TailwindSourceEntry } from '@/tailwindcss/source-scan'

interface CandidateViews {
  values: Set<string>
  sources: Map<string, Set<string>>
}

/** 按候选版本和来源范围缓存视图，限制历史版本的驻留数量。 */
export function createCandidateViewMemo() {
  const memo = new Map<string, Partial<CandidateViews>>()
  return <K extends keyof CandidateViews>(
    kind: K,
    revision: number,
    entries: TailwindSourceEntry[] | undefined,
    excludeEntries: TailwindSourceEntry[] | undefined,
    collect: () => CandidateViews[K],
  ): CandidateViews[K] => {
    if (entries === undefined && !excludeEntries?.length) {
      return collect()
    }
    const key = `${revision}\0${JSON.stringify(entries ?? null)}\0${JSON.stringify(excludeEntries ?? null)}`
    const cached = memo.get(key)
    const view = cached?.[kind]
    if (view) {
      return view
    }
    const result = collect()
    const next = cached ?? {}
    next[kind] = result
    memo.delete(key)
    memo.set(key, next)
    while (memo.size > 64) {
      const oldest = memo.keys().next().value
      if (oldest === undefined) {
        break
      }
      memo.delete(oldest)
    }
    return result
  }
}
