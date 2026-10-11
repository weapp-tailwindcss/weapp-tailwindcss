import type { TailwindSourceEntry } from './types'
import { normalizeGlobPattern } from './entries'
import { isFileExcludedByTailwindSourceEntries } from './matcher'
import { resolveSourceScanPath } from './paths'

export function groupSourceEntriesByBase(entries: TailwindSourceEntry[]) {
  const groups = new Map<string, TailwindSourceEntry[]>()
  for (const entry of entries) {
    const base = resolveSourceScanPath(entry.base)
    const group = groups.get(base) ?? []
    group.push({ ...entry, base, pattern: normalizeGlobPattern(entry.pattern) })
    groups.set(base, group)
  }
  return groups
}

export async function expandSourceEntries(entries: TailwindSourceEntry[], resolveFiles: (options: { cwd: string, sources: TailwindSourceEntry[] }) => Promise<string[]>) {
  const files = new Set<string>()
  await Promise.all([...groupSourceEntriesByBase(entries)].map(async ([cwd, sources]) => {
    if (!sources.some(source => !source.negated)) {
      return
    }
    for (const file of await resolveFiles({ cwd, sources })) {
      files.add(resolveSourceScanPath(file))
    }
  }))
  return [...files].filter(file => !isFileExcludedByTailwindSourceEntries(file, entries))
}

export function mergeSourceEntries(...groups: Array<TailwindSourceEntry[] | undefined>) {
  const entries = new Map<string, TailwindSourceEntry>()
  for (const group of groups) {
    for (const [base, sources] of groupSourceEntriesByBase(group ?? [])) {
      for (const source of sources) {
        const entry = { base, pattern: source.pattern, negated: source.negated }
        entries.set(JSON.stringify(entry), entry)
      }
    }
  }
  return [...entries.values()]
}
