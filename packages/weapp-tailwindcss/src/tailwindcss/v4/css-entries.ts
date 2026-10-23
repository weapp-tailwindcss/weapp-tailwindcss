import path from 'node:path'
import { findNearestPackageRoot } from '@/utils/package-root'

const TAILWIND_V4_CSS_ENTRY_RE = /\.css(?:[?#].*)?$/i

export function isTailwindV4CssEntry(entry: string | undefined): entry is string {
  return typeof entry === 'string' && TAILWIND_V4_CSS_ENTRY_RE.test(entry.trim())
}

export function guessBasedirFromEntries(entries?: string[]) {
  if (!entries) {
    return undefined
  }
  for (const entry of entries) {
    if (typeof entry !== 'string') {
      continue
    }
    const trimmed = entry.trim()
    if (!trimmed || !path.isAbsolute(trimmed)) {
      continue
    }
    if (!isTailwindV4CssEntry(trimmed)) {
      continue
    }
    const entryDir = path.dirname(trimmed)
    const resolved = findNearestPackageRoot(entryDir) ?? entryDir
    if (resolved) {
      return resolved
    }
  }
  return undefined
}

export function normalizeCssEntries(entries: string[] | undefined, anchor: string): string[] | undefined {
  if (!entries || entries.length === 0) {
    return undefined
  }

  const normalized = new Set<string>()
  for (const entry of entries) {
    if (typeof entry !== 'string') {
      continue
    }
    const trimmed = entry.trim()
    if (trimmed.length === 0) {
      continue
    }
    if (!isTailwindV4CssEntry(trimmed)) {
      continue
    }
    const resolved = path.isAbsolute(trimmed)
      ? path.normalize(trimmed)
      : path.normalize(path.resolve(anchor, trimmed))
    normalized.add(resolved)
  }

  return normalized.size > 0 ? [...normalized] : undefined
}

export interface GroupCssEntriesOptions {
  preferredBaseDir?: string | undefined
  workspaceRoot?: string | undefined
}

function isSubPath(parent: string | undefined, child: string | undefined) {
  if (!parent || !child) {
    return false
  }
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function resolveCssEntryBase(entryDir: string, options: GroupCssEntriesOptions): string {
  const normalizedDir = path.normalize(entryDir)
  const { preferredBaseDir, workspaceRoot } = options
  if (preferredBaseDir && isSubPath(preferredBaseDir, normalizedDir)) {
    return preferredBaseDir
  }
  if (workspaceRoot && isSubPath(workspaceRoot, normalizedDir)) {
    return workspaceRoot
  }
  const packageRoot = findNearestPackageRoot(normalizedDir)
  if (packageRoot) {
    return path.normalize(packageRoot)
  }
  return normalizedDir
}

export function groupCssEntriesByBase(entries: string[], options: GroupCssEntriesOptions = {}) {
  const normalizedOptions: GroupCssEntriesOptions = {
    preferredBaseDir: options.preferredBaseDir ? path.normalize(options.preferredBaseDir) : undefined,
    workspaceRoot: options.workspaceRoot ? path.normalize(options.workspaceRoot) : undefined,
  }
  const groups = new Map<string, string[]>()
  for (const entry of entries) {
    const entryDir = path.dirname(entry)
    const baseDir = resolveCssEntryBase(entryDir, normalizedOptions)
    const bucket = groups.get(baseDir)
    if (bucket) {
      bucket.push(entry)
    }
    else {
      groups.set(baseDir, [entry])
    }
  }
  return groups
}
