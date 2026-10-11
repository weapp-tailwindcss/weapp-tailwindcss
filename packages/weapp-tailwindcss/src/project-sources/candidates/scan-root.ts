import type { TailwindSourceEntry } from '@/tailwindcss/source-scan'
import { resolveProjectSourceFiles } from '@weapp-tailwindcss/engine'
import { CANDIDATE_SOURCE_IGNORED_PATTERNS, createSourceScanPlan, sourcePathApi } from '@weapp-tailwindcss/source-scan'
import { isFileExcludedByTailwindSourceEntries, isFileMatchedByTailwindSourceEntries, resolveSourceScanPath, toPosixPath } from '@/tailwindcss/source-scan'

interface ResolveSourceCandidateScanFilesOptions {
  entries?: TailwindSourceEntry[] | undefined
  explicit?: boolean | undefined
  filter: (id: string) => boolean
  outDir?: string | undefined
  root: string
}

type SourceCandidateEligibilityRoot = Omit<ResolveSourceCandidateScanFilesOptions, 'filter'>

function resolveOutDirIgnorePattern(root: string, outDir: string | undefined) {
  if (!outDir) {
    return
  }
  const path = sourcePathApi(root, outDir)
  const relative = path.relative(root, path.resolve(root, outDir))
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return
  }
  return `${toPosixPath(relative)}/**`
}

function normalizeScanEntries(
  root: string,
  entries: TailwindSourceEntry[] | undefined,
  outDirIgnore: string | undefined,
) {
  if (!entries?.length && !outDirIgnore) {
    return undefined
  }
  return createSourceScanPlan({
    base: root,
    mode: 'fallback',
    entries: [...(entries ?? []), ...(outDirIgnore ? [{ base: root, pattern: outDirIgnore, negated: true }] : [])],
  })
}

function shouldApplyDefaultIgnoredSources(entries: TailwindSourceEntry[] | undefined) {
  return entries?.length === undefined
    ? false
    : entries.length > 0 && entries.every(entry => entry.negated)
}

function createDefaultIgnoredSources(
  root: string,
  outDirIgnore: string | undefined,
  entries: TailwindSourceEntry[] | undefined,
  explicit: boolean | undefined,
) {
  const shouldUseTailwindDefaults = !explicit || shouldApplyDefaultIgnoredSources(entries)
  const defaultIgnoredSources = shouldUseTailwindDefaults
    ? CANDIDATE_SOURCE_IGNORED_PATTERNS.map(pattern => ({ base: root, pattern, negated: true }))
    : []
  return [
    ...defaultIgnoredSources,
    ...(outDirIgnore
      ? [{
          base: root,
          pattern: outDirIgnore,
          negated: true,
        }]
      : []),
  ]
}

/** 创建与文件系统 root scan 一致的增量源码资格判断器。 */
export function createSourceCandidateEligibilityMatcher(
  roots: SourceCandidateEligibilityRoot[],
  eligibleFiles?: Iterable<string>,
) {
  const eligibleFileSet = eligibleFiles === undefined
    ? undefined
    : new Set([...eligibleFiles].map(resolveSourceScanPath))
  const matchers = roots.map((options) => {
    const root = resolveSourceScanPath(options.root)
    const outDirIgnore = resolveOutDirIgnorePattern(root, options.outDir)
    const entries = options.entries
    const explicit = options.explicit === true
    const hasPositiveEntry = entries?.some(entry => !entry.negated) === true
    const ignoredSources = createDefaultIgnoredSources(root, outDirIgnore, entries, explicit)
    return (resolvedFile: string) => {
      if (explicit) {
        return hasPositiveEntry && isFileMatchedByTailwindSourceEntries(resolvedFile, entries)
      }
      const path = sourcePathApi(root, resolvedFile)
      const relative = path.relative(root, resolvedFile)
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        return false
      }
      return isFileMatchedByTailwindSourceEntries(resolvedFile, entries)
        && !isFileExcludedByTailwindSourceEntries(resolvedFile, ignoredSources)
        && (eligibleFileSet?.has(resolvedFile) ?? true)
    }
  })
  return (file: string) => {
    const resolvedFile = resolveSourceScanPath(file)
    return matchers.some(matches => matches(resolvedFile))
  }
}

export function resolveSourceCandidateScanFiles(options: ResolveSourceCandidateScanFilesOptions) {
  const resolvedRoot = resolveSourceScanPath(options.root)
  if (options.explicit && !options.entries?.some(entry => !entry.negated)) {
    return Promise.resolve([])
  }
  const outDirIgnore = resolveOutDirIgnorePattern(resolvedRoot, options.outDir)
  const scanEntries = normalizeScanEntries(resolvedRoot, options.entries, outDirIgnore)
  const ignoredSources = createDefaultIgnoredSources(resolvedRoot, outDirIgnore, options.entries, options.explicit)
  return resolveProjectSourceFiles({
    cwd: resolvedRoot,
    ...(scanEntries === undefined ? {} : { sources: scanEntries }),
    ...(ignoredSources.length > 0 ? { ignoredSources } : {}),
    filter: options.filter,
  })
}
