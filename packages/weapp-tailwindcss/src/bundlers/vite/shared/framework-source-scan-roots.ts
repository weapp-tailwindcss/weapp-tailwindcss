import type { TailwindSourceEntry } from '@/tailwindcss/source-scan'
import path from 'node:path'
import { isTailwindV4CssEntry } from '@/tailwindcss/v4/css-entries'

export function collectSourceScanRoots(root: string, entries: TailwindSourceEntry[] | undefined, explicit: boolean, options: { tailwindcssBasedir?: string, tailwindcss?: { v4?: { cssEntries?: readonly string[] } } }) {
  if (entries?.length) {
    return [{ entries, explicit, root }]
  }
  if (explicit && entries !== undefined) {
    return []
  }
  const roots: Array<{ entries?: TailwindSourceEntry[] | undefined, explicit?: boolean, root: string }> = [{ entries, root }]
  const seenRoots = new Set([path.resolve(root)])
  const basedir = options.tailwindcssBasedir
    ? path.resolve(options.tailwindcssBasedir)
    : undefined
  if (basedir && !seenRoots.has(basedir)) {
    roots.push({ root: basedir })
    seenRoots.add(basedir)
  }
  for (const cssEntry of options.tailwindcss?.v4?.cssEntries ?? []) {
    if (!isTailwindV4CssEntry(cssEntry)) {
      continue
    }
    const cssEntryRoot = path.dirname(path.resolve(cssEntry))
    if (seenRoots.has(cssEntryRoot)) {
      continue
    }
    roots.push({ root: cssEntryRoot })
    seenRoots.add(cssEntryRoot)
  }
  return roots
}
